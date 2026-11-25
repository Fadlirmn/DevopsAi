"""Google Gemini via the official `google-genai` SDK (LLM + embeddings)."""

import logging

from google import genai
from google.genai import errors, types

from ..config import EMBEDDING_DIM
from ..interfaces import ChunkHit, GroundedAnswer
from .grounding import (
    ABSTAIN_TEXT,
    REFUSAL_TEXT,
    ANSWER_SCHEMA,
    SYSTEM_PROMPT,
    ProviderUnavailable,
    build_user_message,
    parse_answer,
)

log = logging.getLogger(__name__)


def _wrap(e: Exception) -> ProviderUnavailable:
    if isinstance(e, errors.ClientError):
        code = getattr(e, "code", 0) or 0
        if code in (401, 403):
            return ProviderUnavailable("auth", str(e))
        if code == 429:
            return ProviderUnavailable("rate_limited", str(e))
        log.error("gemini rejected the request: %s", e)
        return ProviderUnavailable("bad_request", str(e))
    if isinstance(e, errors.APIError):
        return ProviderUnavailable("upstream", str(e))
    return ProviderUnavailable("network", str(e))


def _client(api_key: str, timeout_s: float) -> genai.Client:
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_s * 1000)))


class GeminiGenerator:
    """Implements rag.interfaces.Generator."""

    def __init__(self, model: str, api_key: str, timeout_s: float) -> None:
        self._model = model
        self._client = _client(api_key, timeout_s)

    async def answer(self, query: str, context: list[ChunkHit]) -> GroundedAnswer:
        if not context:
            return GroundedAnswer(text=ABSTAIN_TEXT, cited_chunk_ids=[], grounded=False)
        try:
            resp = await self._client.aio.models.generate_content(
                model=self._model,
                contents=build_user_message(query, context),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_json_schema=ANSWER_SCHEMA,
                    # Thinking tokens count against this limit on Gemini 3.x.
                    max_output_tokens=16384,
                ),
            )
        except Exception as e:  # SDK raises errors.* for HTTP, httpx errors for network
            raise _wrap(e) from e
        finish = str(resp.candidates[0].finish_reason) if resp.candidates else ""
        if finish.endswith("MAX_TOKENS"):
            raise ProviderUnavailable("truncated", "answer hit max_output_tokens")
        meta = resp.usage_metadata
        usage_in = (getattr(meta, "prompt_token_count", 0) or 0) if meta else 0
        # Billed output includes thinking tokens.
        usage_out = ((getattr(meta, "candidates_token_count", 0) or 0) + (getattr(meta, "thoughts_token_count", 0) or 0)) if meta else 0
        if not resp.candidates or finish.endswith(("SAFETY", "PROHIBITED_CONTENT")):
            return GroundedAnswer(REFUSAL_TEXT, [], False, usage_in, usage_out)
        try:
            return parse_answer(resp.text or "", context, usage_in, usage_out)
        except (ValueError, TypeError) as e:
            raise ProviderUnavailable("bad_output", str(e)) from e


class GeminiEmbedder:
    """Implements rag.interfaces.Embedder, asking for 768-dim output."""

    def __init__(self, model: str, api_key: str, timeout_s: float) -> None:
        self._model = model
        self._client = _client(api_key, timeout_s)

    async def _embed(self, texts: list[str], task: str) -> list[list[float]]:
        try:
            resp = await self._client.aio.models.embed_content(
                model=self._model,
                contents=texts,
                config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM, task_type=task),
            )
        except Exception as e:
            raise _wrap(e) from e
        return [list(e.values or []) for e in (resp.embeddings or [])]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts, "RETRIEVAL_DOCUMENT")

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed([text], "RETRIEVAL_QUERY"))[0]
