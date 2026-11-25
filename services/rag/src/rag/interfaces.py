"""Provider-agnostic interfaces — see PRD.md §11. Mock these in tests."""

from dataclasses import dataclass
from typing import Protocol

# Fixed texts shown instead of any model output when an answer is not grounded.
ABSTAIN_TEXT = (
    "Maaf, dokumen di koleksi ini tidak membahas pertanyaan itu, jadi saya tidak bisa menjawabnya."
)
REFUSAL_TEXT = "Maaf, pertanyaan ini tidak bisa dijawab di sini."


@dataclass
class ChunkHit:
    chunk_id: str
    document_id: str
    document_title: str
    content: str
    page_number: int | None
    score: float
    heading: str | None = None


@dataclass
class GroundedAnswer:
    text: str
    cited_chunk_ids: list[str]
    grounded: bool
    # Provider-reported token usage when available (0 = unknown / mock).
    input_tokens: int = 0
    output_tokens: int = 0


class Embedder(Protocol):
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    async def embed_query(self, text: str) -> list[float]: ...


class Retriever(Protocol):
    async def retrieve(self, query: str, collection_id: str, limit: int) -> list[ChunkHit]: ...


class Generator(Protocol):
    async def answer(self, query: str, context: list[ChunkHit]) -> GroundedAnswer: ...
