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

# --- grounding.parse_answer: provider JSON -> renumbered markers + chunk ids ---
from rag.providers.grounding import parse_answer  # noqa: E402

def _hit(i):
    return ChunkHit(chunk_id=f"c{i}", document_id="d", document_title="T", content="x", page_number=i, score=0.5)

six = [_hit(i) for i in range(1, 7)]

# model cites passages 5 and 2 (in that order in the text) -> become [1] and [2]
r = parse_answer('{"answer": "Contain first [5]. Then eradicate [2][5].", "citations": [5, 2], "grounded": true}', six)
assert r.text == "Contain first [1]. Then eradicate [2][1].", r.text
assert r.cited_chunk_ids == ["c5", "c2"] and r.grounded is True

# "[1, 3]" list form and out-of-range markers (hallucinated [9]) are handled
r = parse_answer('{"answer": "A [1, 3] and B [9].", "citations": [1, 3, 9], "grounded": true}', six)
assert r.text == "A [1][2] and B.", r.text
assert r.cited_chunk_ids == ["c1", "c3"]

# grounded=false or no valid citations -> abstain, no citations
r = parse_answer('{"answer": "Not covered.", "citations": [], "grounded": false}', six)
assert r.grounded is False and r.cited_chunk_ids == []
r = parse_answer('{"answer": "Claims [8].", "citations": [8], "grounded": true}', six)
assert r.grounded is False and r.cited_chunk_ids == []

# JSON wrapped in prose (some OpenAI-compatible servers) still parses
r = parse_answer('Sure! {"answer": "Yes [1].", "citations": [1], "grounded": true} Done.', six, 10, 5)
assert r.cited_chunk_ids == ["c1"] and (r.input_tokens, r.output_tokens) == (10, 5)

# --- ingest: chunking never crosses sections and keeps overlap ---
from rag.ingest import Section, chunk_sections, _line_heading  # noqa: E402

long = Section("H", 3, " ".join(f"w{i}" for i in range(500)))
parts = chunk_sections([long])
assert all(p.heading == "H" and p.page == 3 for p in parts)
assert len(parts[0].text.split()) == 220 and parts[1].text.split()[0] == "w180"  # 40-word overlap
assert _line_heading("3.2.4 Incident Analysis") == "3.2.4 Incident Analysis"
assert _line_heading("4. Coordination and Information Sharing") == "4 Coordination and Information Sharing"
assert _line_heading("3.2 Detection and Analysis .......... 25") is None
assert _line_heading("16") is None
assert _line_heading("2. What privacy considerations may impact") is None

# Off-topic / prompt-injected output never leaks: no valid citation -> fixed abstain text
from rag.interfaces import ABSTAIN_TEXT  # noqa: E402
r = parse_answer('{"answer": "Ibu kota Prancis adalah Paris.", "citations": [], "grounded": false}', six)
assert r.text == ABSTAIN_TEXT and r.cited_chunk_ids == []
r = parse_answer('{"answer": "Here is a cake recipe: ...", "citations": [42], "grounded": true}', six)
assert r.text == ABSTAIN_TEXT and r.grounded is False

print("OK — grounding parser + chunker")
