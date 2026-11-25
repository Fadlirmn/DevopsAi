"""Runtime configuration from environment variables.

The AI provider is chosen at deploy time (infra/.env), never from the UI:
    LLM_PROVIDER        mock | anthropic | openai | gemini | openai-compatible
    EMBEDDING_PROVIDER  mock | openai | gemini | openai-compatible
Anthropic has no embeddings API, so pair it with another embedding provider.
"""

import os
from dataclasses import dataclass

EMBEDDING_DIM = 768  # must match chunks.embedding vector(768) in 0001_init.sql

LLM_PROVIDERS = {"mock", "anthropic", "openai", "gemini", "openai-compatible"}
EMBEDDING_PROVIDERS = {"mock", "openai", "gemini", "openai-compatible"}

# Default model per provider. Only Anthropic and the embedding models have a
# default; for openai / gemini / openai-compatible LLMs the model must be set
# explicitly (LLM_MODEL) because their catalogs change too often to guess.
DEFAULT_LLM_MODEL = {"anthropic": "claude-opus-5-5", "mock": "mock-dev-v1"}
DEFAULT_EMBEDDING_MODEL = {
    "openai": "text-embedding-3-small",
    "gemini": "gemini-embedding-001",
    "mock": "hash-768",
}

# USD per 1M tokens (input, output) for the daily spend cap. Anthropic prices
# from the published model table; anything else must come from env.
KNOWN_PRICES = {
    "claude-fable-5-2": (8.0, 40.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
}


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _float(name: str, default: float | None) -> float | None:
    raw = _env(name)
    return float(raw) if raw is not None else default


def _int(name: str, default: int) -> int:
    raw = _env(name)
    return int(raw) if raw is not None else default


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    llm_provider: str
    llm_model: str
    llm_api_key: str | None
    llm_base_url: str | None
    llm_effort: str
    llm_timeout_s: float
    embedding_provider: str
    embedding_model: str
    embedding_api_key: str | None
    embedding_base_url: str | None
    price_in_per_mtok: float | None
    price_out_per_mtok: float | None
    daily_spend_cap_usd: float | None
    rate_limit_per_minute: int
    rate_limit_per_day: int
    rate_limit_salt: str
    rag_api_key: str | None
    pipeline_version: str
    min_similarity: float | None

    @property
    def embedding_label(self) -> str:
        """Stored on document_versions.embedding_model; retrieval filters on it."""
        return f"{self.embedding_provider}:{self.embedding_model}"

    @property
    def model_label(self) -> str:
        return f"{self.llm_provider}:{self.llm_model}"


def load_settings() -> Settings:
    llm_provider = (_env("LLM_PROVIDER", "mock") or "mock").lower()
    emb_provider = (_env("EMBEDDING_PROVIDER", "mock") or "mock").lower()
    if llm_provider not in LLM_PROVIDERS:
        raise ConfigError(f"LLM_PROVIDER={llm_provider!r} — pilih salah satu: {sorted(LLM_PROVIDERS)}")
    if emb_provider not in EMBEDDING_PROVIDERS:
        raise ConfigError(
            f"EMBEDDING_PROVIDER={emb_provider!r} — pilih salah satu: {sorted(EMBEDDING_PROVIDERS)}"
            " (Anthropic tidak punya API embedding)"
        )

    llm_model = _env("LLM_MODEL", DEFAULT_LLM_MODEL.get(llm_provider))
    if not llm_model:
        raise ConfigError(f"LLM_MODEL wajib diisi untuk LLM_PROVIDER={llm_provider}")
    emb_model = _env("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL.get(emb_provider))
    if not emb_model:
        raise ConfigError(f"EMBEDDING_MODEL wajib diisi untuk EMBEDDING_PROVIDER={emb_provider}")

    llm_key = _env("LLM_API_KEY")
    if llm_provider in {"anthropic", "openai", "gemini"} and not llm_key:
        raise ConfigError(f"LLM_API_KEY wajib diisi untuk LLM_PROVIDER={llm_provider}")
    emb_key = _env("EMBEDDING_API_KEY", llm_key if emb_provider == llm_provider else None)
    if emb_provider in {"openai", "gemini"} and not emb_key:
        raise ConfigError(f"EMBEDDING_API_KEY wajib diisi untuk EMBEDDING_PROVIDER={emb_provider}")

    llm_base = _env("LLM_BASE_URL")
    emb_base = _env("EMBEDDING_BASE_URL", llm_base if emb_provider == llm_provider else None)
    if llm_provider == "openai-compatible" and not llm_base:
        raise ConfigError("LLM_BASE_URL wajib diisi untuk openai-compatible (mis. http://host.docker.internal:11434/v1)")
    if emb_provider == "openai-compatible" and not emb_base:
        raise ConfigError("EMBEDDING_BASE_URL wajib diisi untuk openai-compatible")

    known = KNOWN_PRICES.get(llm_model, (None, None))
    price_in = _float("LLM_PRICE_INPUT_PER_MTOK", known[0] if llm_provider == "anthropic" else None)
    price_out = _float("LLM_PRICE_OUTPUT_PER_MTOK", known[1] if llm_provider == "anthropic" else None)
    if llm_provider == "mock":
        price_in = price_out = 0.0

    default_pipeline = f"{llm_provider}:{llm_model}|{emb_provider}:{emb_model}"
    return Settings(
        llm_provider=llm_provider,
        llm_model=llm_model,
        llm_api_key=llm_key,
        llm_base_url=llm_base,
        llm_effort=_env("LLM_EFFORT", "low") or "low",
        llm_timeout_s=_float("LLM_TIMEOUT_S", 45.0) or 45.0,
        embedding_provider=emb_provider,
        embedding_model=emb_model,
        embedding_api_key=emb_key,
        embedding_base_url=emb_base,
        price_in_per_mtok=price_in,
        price_out_per_mtok=price_out,
        daily_spend_cap_usd=_float("DAILY_SPEND_CAP_USD", None),
        rate_limit_per_minute=_int("RATE_LIMIT_PER_MINUTE", 10),
        rate_limit_per_day=_int("RATE_LIMIT_PER_DAY", 100),
        rate_limit_salt=_env("RATE_LIMIT_SALT", _env("RAG_API_KEY", "knowledgeops")) or "knowledgeops",
        rag_api_key=_env("RAG_API_KEY"),
        # The cache key includes this, so switching provider/model never serves
        # answers produced by the previous one.
        pipeline_version=_env("PIPELINE_VERSION", default_pipeline) or default_pipeline,
        # Cosine similarity below which a question counts as off-topic and is
        # refused before any LLM call. Embedder-specific: calibrate on real
        # questions (README). Empty = no floor (the LLM still must cite).
        min_similarity=_float("RETRIEVAL_MIN_SIMILARITY", None),
    )
