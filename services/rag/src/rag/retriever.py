"""Exact pgvector scan retriever — no HNSW index at MVP scale (PRD.md §7).

Filters to the published active version of a published public collection in
the query itself (defense in depth — the caller should already have checked
visibility before calling this).
"""

from .db import get_pool
from .interfaces import ChunkHit, Embedder

_SQL = """
SELECT c.id AS chunk_id, d.id AS document_id, d.title AS document_title,
       c.content, c.page_number, c.heading,
       1 - (c.embedding <=> $1::vector) AS similarity
FROM chunks c
JOIN document_versions v ON v.id = c.version_id
JOIN documents d ON d.active_version_id = v.id AND d.status = 'published'
JOIN collections col ON col.id = d.collection_id AND col.status = 'published'
WHERE col.slug = $2 AND col.visibility = 'public'
  AND v.embedding_model = $4  -- only vectors from the embedder that embeds the query
ORDER BY c.embedding <=> $1::vector
LIMIT $3;
"""


def _to_vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


class PgRetriever:
    """Implements rag.interfaces.Retriever. `collection_id` here is the slug —
    that's what the public API and this query both key on."""

    def __init__(self, embedder: Embedder, embedding_label: str) -> None:
        self._embedder = embedder
        self._embedding_label = embedding_label

    async def retrieve(self, query: str, collection_id: str, limit: int) -> list[ChunkHit]:
        embedding = await self._embedder.embed_query(query)
        pool = await get_pool()
        rows = await pool.fetch(
            _SQL, _to_vector_literal(embedding), collection_id, limit, self._embedding_label
        )
        return [
            ChunkHit(
                chunk_id=str(r["chunk_id"]),
                document_id=str(r["document_id"]),
                document_title=r["document_title"],
                content=r["content"],
                page_number=r["page_number"],
                score=float(r["similarity"]),
                heading=r["heading"],
            )
            for r in rows
        ]
