"""Plain-assert smoke test for the pure logic (no DB needed). Run:
    .venv/bin/python tests/test_core.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from rag.cache import cache_key, normalize_question  # noqa: E402
from rag.citations import validate_citations  # noqa: E402
from rag.interfaces import ChunkHit, GroundedAnswer  # noqa: E402

# --- cache key: same question, different casing/whitespace -> same key ---
assert cache_key("  How do I   restart it?  ", "col-1", "fp-1", "v1") == cache_key(
    "how do i restart it?", "col-1", "fp-1", "v1"
)
assert normalize_question("  Multiple   spaces  ") == "multiple spaces"

# --- cache key: different collection/fingerprint/pipeline -> different key ---
base = cache_key("same question", "col-1", "fp-1", "v1")
assert base != cache_key("same question", "col-2", "fp-1", "v1")
assert base != cache_key("same question", "col-1", "fp-2", "v1")
assert base != cache_key("same question", "col-1", "fp-1", "v2")

# --- citation validator: strips IDs that weren't actually retrieved ---
hits = [ChunkHit(chunk_id="a", document_id="d", document_title="T", content="x", page_number=1, score=0.9)]
hallucinated = GroundedAnswer(text="answer", cited_chunk_ids=["a", "ghost"], grounded=True)
cleaned = validate_citations(hallucinated, hits)
assert cleaned.cited_chunk_ids == ["a"]
assert cleaned.grounded is True

# --- citation validator: nothing valid survives -> not grounded ---
all_fake = GroundedAnswer(text="answer", cited_chunk_ids=["ghost"], grounded=True)
cleaned2 = validate_citations(all_fake, hits)
assert cleaned2.cited_chunk_ids == []
assert cleaned2.grounded is False

print("OK — cache key normalization + citation validator")
