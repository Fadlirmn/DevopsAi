"""FastAPI RAG service — internal API called by the SvelteKit BFF
(PRD.md §6 service boundaries). Not the public contract: SvelteKit's
/api/v1/chat proxies to this process's /chat.

The LLM and embedding providers are chosen by env (rag.config): mock (default,
no API key needed), anthropic, openai, gemini, or any openai-compatible server.

Access: when RAG_API_KEY is set, every request except /health must carry it in
`x-internal-key`. That is mandatory once this service is reachable from the
internet (Vercel + VPS mode); on the private Docker network it is defense in
depth. The BFF forwards the visitor IP in `x-client-ip` for rate limiting and
sets `x-rate-exempt: 1` for verified admins — both headers are only trusted
because the key authenticates the caller.
"""

import hmac
import json
import logging
import time
import uuid
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .cache import cache_key, collection_fingerprint, get_cached, set_cached
from .citations import validate_citations
from .config import load_settings
from .db import get_pool
from .interfaces import ChunkHit
from .mock_generator import MIN_SIMILARITY
from .providers import ProviderUnavailable, build_embedder, build_generator
from .ratelimit import actor_hash, check_rate_limit, estimate_cost, spend_today_usd
from .retriever import PgRetriever

log = logging.getLogger("rag")

SETTINGS = load_settings()  # fails fast at startup on a bad provider config
PIPELINE_VERSION = SETTINGS.pipeline_version
MODEL_ID = SETTINGS.model_label
RETRIEVAL_TOP_K = 6  # PRD.md §6 query flow: select 4-8 chunks within token budget

app = FastAPI(title="knowledgeops-rag")
_embedder = build_embedder(SETTINGS)
_generator = build_generator(SETTINGS)
_retriever = PgRetriever(_embedder, SETTINGS.embedding_label)


@app.middleware("http")
async def require_internal_key(request: Request, call_next):
    if SETTINGS.rag_api_key and request.url.path != "/health":
        given = request.headers.get("x-internal-key", "")
        if not hmac.compare_digest(given, SETTINGS.rag_api_key):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)


def _client_ip(request: Request) -> str:
    return request.headers.get("x-client-ip") or (request.client.host if request.client else "unknown")


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
    heading: str | None = None  # section heading; absent in answers cached before it existed


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

    This process has no auth check of its own — the SvelteKit BFF verifies
    the Firebase ID token in hooks.server.ts (PRD.md §9 K-02) before ever
    calling this endpoint. Only safe because this service isn't meant to be
    publicly reachable; it has nothing to fall back on if that assumption
    breaks (e.g. the Vercel+VPS split in PRD.md §6 — add a shared-secret
    check here before exposing this over the public internet).
    """
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT d.id, d.title, d.status AS doc_status,
               col.title AS collection_title, col.visibility,
               v.version_number, v.status AS version_status, v.error_code,
               COALESCE(v.created_at, d.created_at) AS updated_at
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
            "updatedAt": r["updated_at"].isoformat(),
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


@app.get("/admin/settings")
async def get_settings() -> dict:
    """PRD.md §5 /admin/settings. Returns the real running config — there's
    no settings table/persistence yet, so this is read-only, not an editable
    form that would silently fail to save."""
    pool = await get_pool()
    try:
        await pool.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    stale = 0
    spent = 0.0
    if db_ok:
        # Versions embedded by a different embedder are invisible to retrieval
        # until re-embedded (scripts/seed_corpus.py --reembed).
        stale = await pool.fetchval(
            "SELECT count(*) FROM document_versions v JOIN documents d ON d.active_version_id = v.id "
            "WHERE d.status = 'published' AND v.embedding_model IS DISTINCT FROM $1",
            SETTINGS.embedding_label,
        )
        spent = await spend_today_usd(pool)
    s = SETTINGS
    mock_llm = s.llm_provider == "mock"
    mock_emb = s.embedding_provider == "mock"
    return {
        "pipelineVersion": PIPELINE_VERSION,
        "modelId": MODEL_ID,
        "llmProvider": s.llm_provider,
        "llmModel": s.llm_model,
        "embeddingProvider": s.embedding_provider,
        "embeddingModel": s.embedding_model,
        "embedder": type(_embedder).__name__,
        "generator": type(_generator).__name__,
        "retrievalTopK": RETRIEVAL_TOP_K,
        "similarityThreshold": MIN_SIMILARITY if mock_llm else None,
        "rateLimit": {"perMinute": s.rate_limit_per_minute, "perDay": s.rate_limit_per_day},
        "dailySpendCapUsd": s.daily_spend_cap_usd,
        "spentTodayUsd": round(spent, 4),
        "priceKnown": s.price_in_per_mtok is not None and s.price_out_per_mtok is not None,
        "staleEmbeddingVersions": stale,
        "healthChecks": [
            {"name": "Postgres", "status": "connected" if db_ok else "unreachable"},
            {
                "name": "LLM provider",
                "status": "not configured (mock mode)" if mock_llm else f"configured: {s.llm_provider} / {s.llm_model}",
            },
            {
                "name": "Embedding provider",
                "status": "not configured (mock mode)"
                if mock_emb
                else f"configured: {s.embedding_provider} / {s.embedding_model}",
            },
        ],
    }


@app.get("/sources/{document_id}")
async def get_source(document_id: UUID) -> dict:
    """PRD.md §5 /sources/[id] — public detail view. Visibility enforced for
    real here (unlike the /admin/* stubs): this route is public-facing."""
    pool = await get_pool()
    doc = await pool.fetchrow(
        """
        SELECT d.id, d.title, d.source_url, d.license,
               col.title AS collection_title, col.slug AS collection_slug,
               v.id AS version_id, v.version_number
        FROM documents d
        JOIN collections col ON col.id = d.collection_id
         AND col.visibility = 'public' AND col.status = 'published'
        JOIN document_versions v ON v.id = d.active_version_id
        WHERE d.id = $1 AND d.status = 'published'
        """,
        document_id,
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="source not found")

    chunks = await pool.fetch(
        "SELECT id, ordinal, page_number, heading, content FROM chunks "
        "WHERE version_id = $1 ORDER BY ordinal",
        doc["version_id"],
    )
    return {
        "documentId": str(doc["id"]),
        "title": doc["title"],
        "collectionTitle": doc["collection_title"],
        "collectionSlug": doc["collection_slug"],
        "sourceUrl": doc["source_url"],
        "license": doc["license"],
        "versionNumber": doc["version_number"],
        "chunks": [
            {
                "chunkId": str(c["id"]),
                "ordinal": c["ordinal"],
                "page": c["page_number"],
                "heading": c["heading"],
                "content": c["content"],
            }
            for c in chunks
        ],
    }


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
                heading=hit.heading,
            )
        )
    return out


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request) -> ChatResponse:
    request_id = req.clientRequestId or str(uuid.uuid4())
    message = req.message.strip()
    if not message or len(message) > 2000:
        raise HTTPException(status_code=400, detail="message must be 1-2000 characters")

    pool = await get_pool()
    actor = actor_hash(_client_ip(request), SETTINGS.rate_limit_salt)
    if request.headers.get("x-rate-exempt") != "1":
        retry_after = await check_rate_limit(
            pool, actor, SETTINGS.rate_limit_per_minute, SETTINGS.rate_limit_per_day
        )
        if retry_after is not None:
            raise HTTPException(
                status_code=429,
                detail=f"Terlalu banyak pertanyaan. Coba lagi dalam {_human_wait(retry_after)}.",
                headers={"Retry-After": str(retry_after)},
            )
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
    if cached is not None:  # free: no provider call, so allowed even over the spend cap
        await _log_query_event(pool, collection_id, "cache_hit", 0, 0, 0, actor)
        return ChatResponse(**cached, cacheHit=True, requestId=request_id)

    cap = SETTINGS.daily_spend_cap_usd
    if cap is not None and await spend_today_usd(pool) >= cap:
        # PRD K-08: fail closed when the budget is exhausted, don't degrade silently.
        raise HTTPException(status_code=503, detail="Batas biaya AI harian tercapai. Coba lagi besok.")

    start = time.monotonic()
    try:
        hits = await _retriever.retrieve(message, collection["slug"], RETRIEVAL_TOP_K)
        if SETTINGS.min_similarity is not None:
            hits = [h for h in hits if h.score >= SETTINGS.min_similarity]
        # Generators abstain without a provider call when hits is empty.
        raw_answer = await _generator.answer(message, hits)
    except ProviderUnavailable as e:
        log.warning("provider unavailable: %s", e)
        raise HTTPException(status_code=503, detail="Layanan AI sedang tidak tersedia. Coba lagi sebentar.") from e
    answer = validate_citations(raw_answer, hits)
    latency_ms = int((time.monotonic() - start) * 1000)

    # Provider-reported usage; word counts only as a stand-in for the mock.
    input_tokens = raw_answer.input_tokens or max(1, len(message.split()))
    output_tokens = raw_answer.output_tokens or max(1, len(answer.text.split()))
    cost = estimate_cost(
        raw_answer.input_tokens, raw_answer.output_tokens, SETTINGS.price_in_per_mtok, SETTINGS.price_out_per_mtok
    )

    payload = {
        "answer": answer.text,
        "citations": [c.model_dump() for c in _build_citations(answer.cited_chunk_ids, hits)],
        "usage": {"inputTokens": input_tokens, "outputTokens": output_tokens},
        "grounded": answer.grounded,
    }
    await set_cached(key, collection_id, message, PIPELINE_VERSION, payload)
    await _log_query_event(
        pool, collection_id, "answered" if answer.grounded else "abstained",
        latency_ms, input_tokens, output_tokens, actor, cost,
    )

    return ChatResponse(**payload, cacheHit=False, requestId=request_id)


def _human_wait(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} detik"
    if seconds < 5400:
        return f"{round(seconds / 60)} menit"
    return f"{round(seconds / 3600)} jam"


async def _log_query_event(
    pool,
    collection_id: str,
    status: str,
    latency_ms: int,
    input_tokens: int,
    output_tokens: int,
    actor: str | None = None,
    cost_usd: float = 0.0,
) -> None:
    await pool.execute(
        """
        INSERT INTO query_events (collection_id, actor_hash, pipeline_version, model_id, latency_ms,
                                   input_tokens, output_tokens, estimated_cost_usd, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        collection_id, actor, PIPELINE_VERSION, MODEL_ID, latency_ms, input_tokens, output_tokens,
        cost_usd, status,
    )
