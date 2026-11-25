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
    """Changes whenever the collection's set of (published document, active
    version) pairs changes — republish, unpublish/archive, or rollback to an
    older version — so a stale cache entry simply misses instead of needing
    an explicit purge. (max(created_at) alone missed unpublish and rollback.)"""
    pool = await get_pool()
    fingerprint = await pool.fetchval(
        """
        SELECT md5(string_agg(d.id::text || ':' || d.active_version_id::text, ',' ORDER BY d.id))
        FROM documents d
        WHERE d.collection_id = $1 AND d.status = 'published' AND d.active_version_id IS NOT NULL
        """,
        collection_id,
    )
    return fingerprint or "empty"


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
