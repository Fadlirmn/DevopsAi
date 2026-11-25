"""Apply database/migrations/*.sql in order, once each.

    DATABASE_URL=postgresql://... python scripts/migrate.py [migrations_dir]

Tracks applied files in schema_migrations. A database created before this
runner existed (0001 applied by the Postgres init script) is detected by its
`collections` table and 0001 is recorded as applied instead of re-run.
"""

import asyncio
import os
import sys
from pathlib import Path

import asyncpg


async def main() -> None:
    mig_dir = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[3] / "database" / "migrations")
    files = sorted(mig_dir.glob("*.sql"))
    if not files:
        sys.exit(f"no migrations found in {mig_dir}")

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())"
        )
        applied = {r["name"] for r in await conn.fetch("SELECT name FROM schema_migrations")}
        if not applied and await conn.fetchval("SELECT to_regclass('public.collections') IS NOT NULL"):
            await conn.execute("INSERT INTO schema_migrations (name) VALUES ($1)", files[0].name)
            applied.add(files[0].name)
            print(f"bootstrap: {files[0].name} already present")

        for f in files:
            if f.name in applied:
                continue
            async with conn.transaction():
                await conn.execute(f.read_text())
                await conn.execute("INSERT INTO schema_migrations (name) VALUES ($1)", f.name)
            print(f"applied: {f.name}")
        print("migrations up to date")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
