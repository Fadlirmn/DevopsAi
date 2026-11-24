"""Strip citation IDs the generator claimed but that weren't actually retrieved.

PRD.md §6 query flow, step 7: never let a hallucinated chunk ID reach the
visitor. If nothing survives, the answer can't claim to be grounded either.
"""

from .interfaces import ChunkHit, GroundedAnswer


def validate_citations(answer: GroundedAnswer, retrieved: list[ChunkHit]) -> GroundedAnswer:
    valid_ids = {c.chunk_id for c in retrieved}
    kept = [cid for cid in answer.cited_chunk_ids if cid in valid_ids]
    return GroundedAnswer(
        text=answer.text,
        cited_chunk_ids=kept,
        grounded=answer.grounded and bool(kept),
    )
