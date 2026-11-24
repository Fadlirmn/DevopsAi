"""Mock generator for local dev — not a real LLM.

Composes a templated answer citing every retrieved chunk above a crude
similarity floor, or abstains when nothing clears it. Good enough to prove
the citation-validation and abstain paths (PRD.md §6, K-06) without calling
a paid LLM.
"""

from .interfaces import ChunkHit, GroundedAnswer

ABSTAIN_TEXT = (
    "I don't have enough evidence in this collection to answer that confidently."
)
MIN_SIMILARITY = 0.18  # tuned for the hashing mock only — not a real relevance threshold


class MockGenerator:
    """Implements rag.interfaces.Generator."""

    async def answer(self, query: str, context: list[ChunkHit]) -> GroundedAnswer:
        strong = [c for c in context if c.score >= MIN_SIMILARITY]
        if not strong:
            return GroundedAnswer(text=ABSTAIN_TEXT, cited_chunk_ids=[], grounded=False)
        markers = " ".join(f"[{i + 1}]" for i in range(len(strong)))
        text = f"Based on the retrieved passages {markers}, see the cited excerpts below."
        return GroundedAnswer(
            text=text,
            cited_chunk_ids=[c.chunk_id for c in strong],
            grounded=True,
        )
