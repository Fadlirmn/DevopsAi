"""FastAPI RAG service — internal API called by the SvelteKit BFF
(PRD.md §6 service boundaries). Not the public contract: SvelteKit's
/api/v1/chat proxies to this process's /chat.

Dev/mock mode only: wired to MockEmbedder/MockGenerator so it runs without
a paid provider (PRD.md §15 Definition of done). Swap those two for real
provider adapters when one is pinned (PRD.md §7) — nothing else changes,
that's the point of the Embedder/Generator protocols in interfaces.py.
"""

import json
import os
import time
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .cache import cache_key, collection_fingerprint, get_cached, set_cached
from .citations import validate_citations
from .db import get_pool
from .interfaces import ChunkHit
from .mock_embedder import MockEmbedder
from .mock_generator import MockGenerator
from .retriever import PgRetriever

PIPELINE_VERSION = os.environ.get("PIPELINE_VERSION", "dev-mock-v1")
MODEL_ID = "mock-dev-v1"

app = FastAPI(title="knowledgeops-rag")
_embedder = MockEmbedder()
_generator = MockGenerator()
_retriever = PgRetriever(_embedder)


class ChatRequest(BaseModel):
    collectionSlug: str
    message: str
    history: list[dict] = []
    clientRequestId: str | None = None


class Citation(BaseModel):
    marker: int
    chunkId: str
    documentId: str
    title: str
    page: int | None
    excerpt: str


class Usage(BaseModel):
    inputTokens: int
    outputTokens: int


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    requestId: str
    usage: Usage
    grounded: bool
    cacheHit: bool


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/collections")
async def list_collections() -> list[dict]:
    """PRD.md §8 GET /collections — published public collections only."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT slug, title, description FROM collections "
        "WHERE visibility = 'public' AND status = 'published' ORDER BY title"
    )
    return [dict(r) for r in rows]


@app.get("/admin/documents")
async def list_admin_documents() -> list[dict]:
    """PRD.md §8 GET /admin/documents — documents and their active version.

    No auth check here yet (Firebase admin verification is still a stub,
    PRD.md §9 K-02) — do not deploy this route publicly until that lands.
    """
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT d.id, d.title, d.status AS doc_status,
               col.title AS collection_title, col.visibility,
               v.version_number, v.status AS version_status, v.error_code
        FROM documents d
        JOIN collections col ON col.id = d.collection_id
        LEFT JOIN document_versions v ON v.id = d.active_version_id
        ORDER BY d.created_at DESC
        """
    )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "docStatus": r["doc_status"],
            "collectionTitle": r["collection_title"],
            "visibility": r["visibility"],
            "versionNumber": r["version_number"],
            "versionStatus": r["version_status"],
            "errorCode": r["error_code"],
        }
        for r in rows
    ]


@app.get("/admin/evaluations")
async def list_evaluations() -> list[dict]:
    """PRD.md §8 GET /admin/evaluations. No runner exists yet (PRD.md §13 M3),
    so this is honestly empty until one writes real rows here — never fake one."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, dataset_version, metrics, status, created_at FROM evaluation_runs "
        "ORDER BY created_at DESC"
    )
    return [
        {
            "id": str(r["id"]),
            "datasetVersion": r["dataset_version"],
            "metrics": json.loads(r["metrics"]) if r["metrics"] else None,
            "status": r["status"],
            "createdAt": r["created_at"].isoformat(),
        }
        for r in rows
    ]


@app.get("/admin/coverage-gaps")
async def coverage_gaps() -> list[dict]:
    """PRD.md §8 GET /admin/coverage-gaps — abstained questions from answer_cache,
    by frequency (K-17). hit_count only counts repeat hits, so timesAsked is +1
    for the original request that created the row (PRD.md §6 cache interaction note)."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT question_text, hit_count, created_at
        FROM answer_cache
        WHERE (answer->>'grounded')::boolean = false
        ORDER BY hit_count DESC, created_at DESC
        LIMIT 50
        """
    )
    return [
        {
            "question": r["question_text"],
            "timesAsked": r["hit_count"] + 1,
            "firstSeen": r["created_at"].isoformat(),
        }
        for r in rows
    ]


def _build_citations(cited_chunk_ids: list[str], hits: list[ChunkHit]) -> list[Citation]:
    by_id = {h.chunk_id: h for h in hits}
    out = []
    for i, cid in enumerate(cited_chunk_ids):
        hit = by_id[cid]
        out.append(
            Citation(
                marker=i + 1,
                chunkId=hit.chunk_id,
                documentId=hit.document_id,
                title=hit.document_title,
                page=hit.page_number,
                excerpt=hit.content[:280],
            )
        )
    return out


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    request_id = req.clientRequestId or str(uuid.uuid4())
    message = req.message.strip()
    if not message or len(message) > 2000:
        raise HTTPException(status_code=400, detail="message must be 1-2000 characters")

    pool = await get_pool()
    collection = await pool.fetchrow(
        "SELECT id, slug FROM collections WHERE slug = $1 AND visibility = 'public' AND status = 'published'",
        req.collectionSlug,
    )
    if collection is None:
        raise HTTPException(status_code=404, detail="collection not found")
    collection_id = str(collection["id"])

    fingerprint = await collection_fingerprint(collection_id)
    key = cache_key(message, collection_id, fingerprint, PIPELINE_VERSION)

    cached = await get_cached(key)
    if cached is not None:
        await _log_query_event(pool, collection_id, "cache_hit", 0, 0, 0)
        return ChatResponse(**cached, cacheHit=True, requestId=request_id)

    start = time.monotonic()
    hits = await _retriever.retrieve(message, collection["slug"], 6)
    raw_answer = await _generator.answer(message, hits)
    answer = validate_citations(raw_answer, hits)
    latency_ms = int((time.monotonic() - start) * 1000)

    input_tokens = max(1, len(message.split()))
    output_tokens = max(1, len(answer.text.split()))

    payload = {
        "answer": answer.text,
        "citations": [c.model_dump() for c in _build_citations(answer.cited_chunk_ids, hits)],
        "usage": {"inputTokens": input_tokens, "outputTokens": output_tokens},
        "grounded": answer.grounded,
    }
    await set_cached(key, collection_id, message, PIPELINE_VERSION, payload)
    await _log_query_event(
        pool, collection_id, "answered" if answer.grounded else "abstained",
        latency_ms, input_tokens, output_tokens,
    )

    return ChatResponse(**payload, cacheHit=False, requestId=request_id)


async def _log_query_event(
    pool, collection_id: str, status: str, latency_ms: int, input_tokens: int, output_tokens: int
) -> None:
    await pool.execute(
        """
        INSERT INTO query_events (collection_id, pipeline_version, model_id, latency_ms,
                                   input_tokens, output_tokens, estimated_cost_usd, status)
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
        """,
        collection_id, PIPELINE_VERSION, MODEL_ID, latency_ms, input_tokens, output_tokens, status,
    )
