"""Shared asyncpg pool. One process-wide pool, lazily created."""

import asyncio
import os

import asyncpg

_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # Without the lock, concurrent first requests each create (and leak) a pool.
        async with _lock:
            if _pool is None:
                dsn = os.environ["DATABASE_URL"]
                _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
    return _pool
