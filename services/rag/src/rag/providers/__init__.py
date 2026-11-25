"""Builds the Embedder/Generator pair chosen by env (see rag.config)."""

from ..config import EMBEDDING_DIM, Settings
from ..interfaces import Embedder, Generator
from ..mock_embedder import MockEmbedder
from ..mock_generator import MockGenerator
from .grounding import ProviderUnavailable

__all__ = ["build_embedder", "build_generator", "ProviderUnavailable", "CheckedEmbedder"]


class CheckedEmbedder:
    """Fails loudly if a provider returns vectors that don't fit vector(768)."""

    def __init__(self, inner: Embedder, label: str) -> None:
        self._inner = inner
        self._label = label

    def _check(self, vecs: list[list[float]]) -> list[list[float]]:
        for v in vecs:
            if len(v) != EMBEDDING_DIM:
                raise ProviderUnavailable(
                    "dimension",
                    f"{self._label} returned {len(v)} dims; the database expects {EMBEDDING_DIM}",
                )
        return vecs

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._check(await self._inner.embed_documents(texts))

    async def embed_query(self, text: str) -> list[float]:
        return self._check([await self._inner.embed_query(text)])[0]


def build_embedder(s: Settings) -> Embedder:
    p = s.embedding_provider
    if p == "mock":
        inner: Embedder = MockEmbedder()
    elif p in ("openai", "openai-compatible"):
        from .openai_provider import OpenAIEmbedder

        inner = OpenAIEmbedder(
            s.embedding_model, s.embedding_api_key, s.embedding_base_url, s.llm_timeout_s, compatible=p != "openai"
        )
    else:  # gemini
        from .gemini_provider import GeminiEmbedder

        inner = GeminiEmbedder(s.embedding_model, s.embedding_api_key or "", s.llm_timeout_s)
    return CheckedEmbedder(inner, s.embedding_label)


def build_generator(s: Settings) -> Generator:
    p = s.llm_provider
    if p == "mock":
        return MockGenerator()
    if p == "anthropic":
        from .anthropic_provider import AnthropicGenerator

        return AnthropicGenerator(s.llm_model, s.llm_api_key or "", s.llm_effort, s.llm_timeout_s)
    if p in ("openai", "openai-compatible"):
        from .openai_provider import OpenAIGenerator

        return OpenAIGenerator(s.llm_model, s.llm_api_key, s.llm_base_url, s.llm_timeout_s, compatible=p != "openai")
    from .gemini_provider import GeminiGenerator

    return GeminiGenerator(s.llm_model, s.llm_api_key or "", s.llm_timeout_s)
