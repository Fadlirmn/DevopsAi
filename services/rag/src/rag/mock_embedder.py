"""Deterministic hashing embedder for local dev/tests — not a real model.

Bag-of-hashed-words: textually similar strings land on similar vectors, which
is enough to exercise retrieval end-to-end without a paid embedding API. A
real provider must be pinned before production (see PRD.md §7) — this is
dev-only.
"""

import hashlib
import math
import re

DIM = 768  # matches database/migrations/0001_init.sql vector(768) — dev placeholder only

# Stripped so two unrelated questions don't collide purely on shared function
# words ("the", "of", "is") — without this, "capital of France" scored close
# to a real Kubernetes match just by sharing "the"/"of" with stored chunks.
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "do", "does", "for",
    "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this",
    "to", "was", "what", "when", "where", "which", "who", "will", "with",
}


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOPWORDS]


def embed_text(text: str) -> list[float]:
    vec = [0.0] * DIM
    for tok in _tokens(text):
        h = hashlib.sha256(tok.encode()).digest()
        for i in range(0, len(h) - 1, 2):
            idx = h[i] % DIM
            vec[idx] += 1.0 if h[i + 1] % 2 == 0 else -1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


class MockEmbedder:
    """Implements rag.interfaces.Embedder."""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [embed_text(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return embed_text(text)
