"""Public /chat protections (PRD K-08): per-client rate limit and a global
daily spend cap. State lives in Postgres so it holds across processes,
restarts, and serverless instances — never in per-process memory."""

import hashlib
import random
from datetime import datetime, timedelta, timezone

_HIT_SQL = """
INSERT INTO rate_limit_counters (actor_hash, window_kind, window_start, hits)
VALUES ($1, 'minute', date_trunc('minute', now()), 1),
       ($1, 'day',    date_trunc('day',    now()), 1)
ON CONFLICT (actor_hash, window_kind, window_start)
DO UPDATE SET hits = rate_limit_counters.hits + 1
RETURNING window_kind, hits
"""


def actor_hash(client_ip: str, salt: str) -> str:
    """Never store raw IPs: a salted hash is enough to count per visitor."""
    return hashlib.sha256(f"{salt}|{client_ip}".encode()).hexdigest()


async def check_rate_limit(pool, actor: str, per_minute: int, per_day: int) -> int | None:
    """Count this request. Returns None if allowed, else seconds until retry."""
    rows = await pool.fetch(_HIT_SQL, actor)
    hits = {r["window_kind"]: r["hits"] for r in rows}

    if random.random() < 0.01:  # opportunistic cleanup, keeps the table tiny
        await pool.execute("DELETE FROM rate_limit_counters WHERE window_start < now() - interval '2 days'")

    now = datetime.now(timezone.utc)
    if per_day > 0 and hits.get("day", 0) > per_day:
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return max(1, int((tomorrow - now).total_seconds()))
    if per_minute > 0 and hits.get("minute", 0) > per_minute:
        return max(1, 60 - now.second)
    return None


async def spend_today_usd(pool) -> float:
    value = await pool.fetchval(
        "SELECT coalesce(sum(estimated_cost_usd), 0) FROM query_events WHERE created_at >= date_trunc('day', now())"
    )
    return float(value or 0)


def estimate_cost(input_tokens: int, output_tokens: int, price_in: float | None, price_out: float | None) -> float:
    if price_in is None or price_out is None:
        return 0.0
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000
