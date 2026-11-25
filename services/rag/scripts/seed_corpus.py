"""Download and ingest the public seed corpus (docs/SEED_CORPUS_SOURCES.md).

    DATABASE_URL=... python scripts/seed_corpus.py --set all    # Docker default: every source
    DATABASE_URL=... python scripts/seed_corpus.py --set demo   # Vercel demo: NIST SP 800-61r2 only
    DATABASE_URL=... python scripts/seed_corpus.py --reembed    # after changing EMBEDDING_PROVIDER/MODEL

Uses the embedder configured by env (EMBEDDING_PROVIDER, ...), the same one the
API uses at query time. Idempotent: unchanged documents are skipped. A source
that fails to download is reported and skipped; the rest still load.
Originals are cached in CORPUS_CACHE_DIR (default eval/datasets/raw, gitignored).
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import asyncpg  # noqa: E402

from rag.config import load_settings  # noqa: E402
from rag.ingest import SOURCES, download, ensure_collection, ingest  # noqa: E402
from rag.providers import build_embedder  # noqa: E402



def default_cache() -> Path:
    """Repo checkout: eval/datasets/raw (gitignored). In Docker CORPUS_CACHE_DIR is set."""
    return Path(__file__).resolve().parents[3] / "eval" / "datasets" / "raw"


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", choices=["demo", "all"], default=os.environ.get("SEED_SET", "all"))
    ap.add_argument(
        "--reembed",
        action="store_true",
        help="re-extract and re-embed every seeded document (after changing the embedder or the extractor)",
    )
    args = ap.parse_args()

    settings = load_settings()
    embedder = build_embedder(settings)
    cache = Path(os.environ["CORPUS_CACHE_DIR"]) if os.environ.get("CORPUS_CACHE_DIR") else default_cache()
    wanted = [s for s in SOURCES if args.set in s.sets]
    print(f"seed set '{args.set}': {len(wanted)} source(s), embedder {settings.embedding_label}")

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    failures = 0
    try:
        collection_id = await ensure_collection(conn)
        # Synthetic data from the old seed_dev.py has no place next to real documents.
        await conn.execute(
            "UPDATE collections SET status = 'archived' WHERE slug = 'incident-playbooks' AND status <> 'archived'"
        )
        await conn.execute(
            "UPDATE documents SET status = 'archived' WHERE status <> 'archived' AND collection_id IN "
            "(SELECT id FROM collections WHERE slug = 'incident-playbooks')"
        )
        if args.reembed:
            await conn.execute(
                "UPDATE document_versions SET embedding_model = 'stale' WHERE document_id IN "
                "(SELECT id FROM documents WHERE collection_id = $1)",
                collection_id,
            )
        for src in wanted:
            try:
                data = download(src, cache)
                result = await ingest(conn, collection_id, src, data, embedder, settings.embedding_label)
                print(f"  {result:9} {src.slug}")
            except Exception as e:  # keep going: one unreachable site must not block the rest
                failures += 1
                print(f"  FAILED    {src.slug}: {e}", file=sys.stderr)
        total = await conn.fetchval(
            "SELECT count(*) FROM chunks c JOIN documents d ON d.active_version_id = c.version_id "
            "WHERE d.collection_id = $1",
            collection_id,
        )
        print(f"collection 'it-ops': {total} chunks; {failures} source(s) failed")
    finally:
        await conn.close()
    return 1 if failures == len(wanted) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
