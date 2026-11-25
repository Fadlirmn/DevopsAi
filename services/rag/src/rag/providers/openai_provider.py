"""OpenAI and any OpenAI-compatible server (Ollama, Groq, OpenRouter, vLLM, ...)
via the official `openai` SDK with a custom base_url."""

import logging

import openai

from ..config import EMBEDDING_DIM
from ..interfaces import ChunkHit, GroundedAnswer
from .grounding import (
    ABSTAIN_TEXT,
    ANSWER_SCHEMA,
    SYSTEM_PROMPT,
    ProviderUnavailable,
    build_user_message,
    parse_answer,
)

log = logging.getLogger(__name__)


def _wrap(e: Exception) -> ProviderUnavailable:
    if isinstance(e, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return ProviderUnavailable("auth", str(e))
    if isinstance(e, openai.RateLimitError):
        return ProviderUnavailable("rate_limited", str(e))
    if isinstance(e, openai.BadRequestError):
        log.error("provider rejected the request: %s", e)
        return ProviderUnavailable("bad_request", str(e))
    if isinstance(e, openai.APIStatusError):
        return ProviderUnavailable("upstream", str(e.status_code))
    return ProviderUnavailable("network", str(e))


class OpenAIGenerator:
    """Implements rag.interfaces.Generator. `compatible=True` uses plain JSON mode
    (widely supported) instead of OpenAI's strict json_schema."""

    def __init__(self, model: str, api_key: str | None, base_url: str | None, timeout_s: float, compatible: bool):
        self._model = model
        self._compatible = compatible
        # Local servers like Ollama ignore the key but the SDK requires a value.
        self._client = openai.AsyncOpenAI(
            api_key=api_key or "not-needed", base_url=base_url, timeout=timeout_s, max_retries=2
        )

    async def answer(self, query: str, context: list[ChunkHit]) -> GroundedAnswer:
        if not context:
            return GroundedAnswer(text=ABSTAIN_TEXT, cited_chunk_ids=[], grounded=False)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_message(query, context)},
        ]
        try:
            if self._compatible:
                resp = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    max_tokens=2048,
                )
            else:
                resp = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": "grounded_answer", "schema": ANSWER_SCHEMA, "strict": True},
                    },
                    max_completion_tokens=4096,
                )
        except openai.APIError as e:
            raise _wrap(e) from e

        choice = resp.choices[0] if resp.choices else None
        if choice is None or choice.finish_reason == "length":
            raise ProviderUnavailable("truncated", "no complete answer")
        usage_in = getattr(resp.usage, "prompt_tokens", 0) or 0
        usage_out = getattr(resp.usage, "completion_tokens", 0) or 0
        try:
            return parse_answer(choice.message.content or "", context, usage_in, usage_out)
        except (ValueError, TypeError) as e:
            raise ProviderUnavailable("bad_output", str(e)) from e


class OpenAIEmbedder:
    """Implements rag.interfaces.Embedder. OpenAI's text-embedding-3-* models
    shorten to 768 dims via `dimensions`; compatible servers must already return
    768 (e.g. Ollama nomic-embed-text), checked by CheckedEmbedder."""

    def __init__(self, model: str, api_key: str | None, base_url: str | None, timeout_s: float, compatible: bool):
        self._model = model
        self._compatible = compatible
        self._client = openai.AsyncOpenAI(
            api_key=api_key or "not-needed", base_url=base_url, timeout=timeout_s, max_retries=2
        )

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        kwargs = {} if self._compatible else {"dimensions": EMBEDDING_DIM}
        try:
            resp = await self._client.embeddings.create(model=self._model, input=texts, **kwargs)
        except openai.APIError as e:
            raise _wrap(e) from e
        return [d.embedding for d in sorted(resp.data, key=lambda d: d.index)]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts)

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed([text]))[0]
