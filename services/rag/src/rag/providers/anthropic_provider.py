"""Claude via the official Anthropic Python SDK (LLM only — Anthropic has no
embeddings API; pair it with another EMBEDDING_PROVIDER)."""

import logging

import anthropic

from ..interfaces import ChunkHit, GroundedAnswer
from .grounding import (
    ABSTAIN_TEXT,
    ANSWER_SCHEMA,
    REFUSAL_TEXT,
    SYSTEM_PROMPT,
    ProviderUnavailable,
    build_user_message,
    parse_answer,
)

log = logging.getLogger(__name__)

# Models that accept the server-side refusal fallback (`fallbacks: "default"`).
_FALLBACK_MODELS = {"claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}


class AnthropicGenerator:
    """Implements rag.interfaces.Generator."""

    def __init__(self, model: str, api_key: str, effort: str, timeout_s: float) -> None:
        self._model = model
        self._effort = effort
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout_s, max_retries=2)

    async def answer(self, query: str, context: list[ChunkHit]) -> GroundedAnswer:
        if not context:
            return GroundedAnswer(text=ABSTAIN_TEXT, cited_chunk_ids=[], grounded=False)

        params = dict(
            model=self._model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            output_config={
                "effort": self._effort,
                "format": {"type": "json_schema", "schema": ANSWER_SCHEMA},
            },
            messages=[{"role": "user", "content": build_user_message(query, context)}],
        )
        try:
            if self._model in _FALLBACK_MODELS:
                # On a safety decline the API re-runs the request on a fallback
                # model inside the same call instead of just stopping.
                response = await self._client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **params
                )
            else:
                response = await self._client.messages.create(**params)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
            raise ProviderUnavailable("auth", str(e)) from e
        except anthropic.RateLimitError as e:
            raise ProviderUnavailable("rate_limited", str(e)) from e
        except anthropic.BadRequestError as e:
            log.error("anthropic rejected the request: %s", e)
            raise ProviderUnavailable("bad_request", str(e)) from e
        except anthropic.APIStatusError as e:
            raise ProviderUnavailable("upstream", f"{e.status_code}") from e
        except (anthropic.APITimeoutError, anthropic.APIConnectionError) as e:
            raise ProviderUnavailable("network", str(e)) from e

        usage_in = getattr(response.usage, "input_tokens", 0) or 0
        usage_out = getattr(response.usage, "output_tokens", 0) or 0

        if response.stop_reason == "refusal":
            return GroundedAnswer(REFUSAL_TEXT, [], False, usage_in, usage_out)
        if response.stop_reason == "max_tokens":
            raise ProviderUnavailable("truncated", "answer hit max_tokens")

        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            return parse_answer(text, context, usage_in, usage_out)
        except (ValueError, TypeError) as e:
            raise ProviderUnavailable("bad_output", str(e)) from e
