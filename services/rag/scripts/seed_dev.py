"""Seed one public published collection + document + chunks for local dev.

Embeddings are computed with the same MockEmbedder the API uses at query
time, so retrieval similarity is actually meaningful locally. Run after the
DB migration has applied:

    DATABASE_URL=postgresql://... python scripts/seed_dev.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import asyncpg  # noqa: E402

from rag.mock_embedder import embed_text  # noqa: E402

CHUNKS = [
    (
        1,
        "Checking Rollout History",
        "kubectl rollout undo deployment/<name> reverts the deployment to the previous "
        "ReplicaSet. Use this as the fast path when a new rollout is clearly broken.",
    ),
    (
        2,
        "Rollout History",
        "kubectl rollout history deployment/<name> --revision=<n> shows the detail of a "
        "specific earlier revision, useful when you need to roll back further than one step.",
    ),
    (
        3,
        "Incident Response Playbook",
        "Confirm scope and business impact before deep debugging. Then check upstream "
        "health, recent deploys, and resource saturation on the failing service.",
    ),
]


async def main() -> None:
    dsn = os.environ["DATABASE_URL"]
    conn = await asyncpg.connect(dsn)
    try:
        collection_id = await conn.fetchval(
            """
            INSERT INTO collections (slug, title, description, visibility, status)
            VALUES ('incident-playbooks', 'Incident Playbooks', 'Seeded dev data', 'public', 'published')
            ON CONFLICT (slug) DO UPDATE SET status = 'published'
            RETURNING id
            """
        )
        document_id = await conn.fetchval(
            "SELECT id FROM documents WHERE collection_id = $1 AND title = 'Seeded Runbook'",
            collection_id,
        )
        if document_id is None:
            document_id = await conn.fetchval(
                """
                INSERT INTO documents (collection_id, title, source_type, status)
                VALUES ($1, 'Seeded Runbook', 'pdf', 'published')
                RETURNING id
                """,
                collection_id,
            )
        # Re-running this script (e.g. after tuning the mock embedder) must
        # refresh the existing version in place, not fail on the
        # UNIQUE(document_id, version_number) constraint.
        version_id = await conn.fetchval(
            """
            INSERT INTO document_versions (document_id, version_number, object_key, sha256, mime_type, bytes, status)
            VALUES ($1, 1, 'dev/seeded-runbook-v1.pdf', repeat('0', 64), 'application/pdf', 1024, 'ready')
            ON CONFLICT (document_id, version_number) DO UPDATE SET status = EXCLUDED.status
            RETURNING id
            """,
            document_id,
        )
        await conn.execute(
            "UPDATE documents SET active_version_id = $1 WHERE id = $2", version_id, document_id
        )

        for ordinal, heading, content in CHUNKS:
            vec = embed_text(content)
            vec_literal = "[" + ",".join(f"{x:.8f}" for x in vec) + "]"
            await conn.execute(
                """
                INSERT INTO chunks (version_id, ordinal, page_number, heading, content, token_count, embedding)
                VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
                ON CONFLICT (version_id, ordinal) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
                """,
                version_id, ordinal, ordinal, heading, content, len(content.split()), vec_literal,
            )

        print(f"Seeded collection 'incident-playbooks' ({collection_id}) with {len(CHUNKS)} chunks.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
