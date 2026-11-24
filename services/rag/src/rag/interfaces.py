"""Provider-agnostic interfaces — see PRD.md §11. Mock these in tests."""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ChunkHit:
    chunk_id: str
    document_id: str
    content: str
    page_number: int | None
    score: float


@dataclass
class GroundedAnswer:
    text: str
    cited_chunk_ids: list[str]
    grounded: bool


class Embedder(Protocol):
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    async def embed_query(self, text: str) -> list[float]: ...


class Retriever(Protocol):
    async def retrieve(self, query: str, collection_id: str, limit: int) -> list[ChunkHit]: ...


class Generator(Protocol):
    async def answer(self, query: str, context: list[ChunkHit]) -> GroundedAnswer: ...
