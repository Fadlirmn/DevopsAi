"""Exact-match answer cache — PRD.md §6 query-flow steps 2/7, §7 answer_cache.

Cache scope is exact match only (normalized text), never semantic similarity —
see PRD.md §6 for why a fuzzy match would be unsafe here.
"""

import hashlib
import json
import re

from .db import get_pool


def normalize_question(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def cache_key(question: str, collection_id: str, fingerprint: str, pipeline_version: str) -> str:
    normalized = normalize_question(question)
    raw = f"{normalized}|{collection_id}|{fingerprint}|{pipeline_version}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def collection_fingerprint(collection_id: str) -> str:
    """Changes whenever the collection's published version set changes, so a
    stale cache entry simply misses after a republish instead of needing an
    explicit purge."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT max(v.created_at) AS latest
        FROM document_versions v
        JOIN documents d ON d.active_version_id = v.id
        WHERE d.collection_id = $1
        """,
        collection_id,
    )
    latest = row["latest"] if row else None
    return latest.isoformat() if latest else "empty"


async def get_cached(key: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT id, answer FROM answer_cache WHERE cache_key = $1", key)
    if row is None:
        return None
    await pool.execute(
        "UPDATE answer_cache SET hit_count = hit_count + 1, last_hit_at = now() WHERE id = $1",
        row["id"],
    )
    return json.loads(row["answer"])


async def set_cached(
    key: str, collection_id: str, question: str, pipeline_version: str, answer: dict
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO answer_cache (cache_key, collection_id, question_text, pipeline_version, answer)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (cache_key) DO UPDATE SET answer = EXCLUDED.answer
        """,
        key,
        collection_id,
        question,
        pipeline_version,
        json.dumps(answer),
    )
