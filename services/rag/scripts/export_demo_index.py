"""Export the Vercel demo index: the NIST SP 800-61r2 chunks as JSON, produced
by the same extractor/chunker the VPS ingestion uses.

    python scripts/export_demo_index.py   # writes apps/web/src/lib/server/demo/nist-index.json

The Vercel demo (no VPS, no database) searches this file with BM25. NIST SP
800-61r2 is a U.S. Government work (public domain), so committing it is fine.
Re-run after changing the extractor in rag/ingest.py.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from rag.ingest import SOURCES, download, extract  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "apps" / "web" / "src" / "lib" / "server" / "demo" / "nist-index.json"


def main() -> None:
    src = next(s for s in SOURCES if s.slug == "nist-sp-800-61r2")
    data = download(src, ROOT / "eval" / "datasets" / "raw")
    chunks = extract(src, data)
    doc = {
        "documentId": "demo-nist",
        "title": src.title,
        "sourceUrl": src.url,
        "license": src.license,
        "chunks": [
            {"chunkId": f"nist-{i + 1}", "ordinal": i + 1, "page": c.page, "heading": c.heading, "content": c.text}
            for i, c in enumerate(chunks)
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(chunks)} chunks, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
