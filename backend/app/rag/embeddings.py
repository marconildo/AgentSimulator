"""Embedding models.

In demo mode we use deterministic, dependency-free hash embeddings: each token
is hashed into a fixed-size vector. Documents that share words end up with
similar vectors, so cosine search still returns genuinely relevant chunks — the
retrieval demo is meaningful even without OpenAI.
"""

from __future__ import annotations

import hashlib
import math
import re

from langchain_core.embeddings import Embeddings

from ..config import get_settings

_MOCK_DIM = 512
_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Common words carry little topical signal; dropping them sharpens relevance so
# a query like "what is RAG" clearly matches the RAG document.
_STOPWORDS = frozenset(
    """a an and are as at be but by can do does for from how in into is it its of on or
    that the this to what when which with you your""".split()
)


class MockEmbeddings(Embeddings):
    """Deterministic term-frequency hash embeddings, L2-normalized.

    Each (non-stopword) token is hashed to a bucket and counted. Documents that
    share distinctive vocabulary land close together under cosine similarity, so
    retrieval is genuinely meaningful even without a real embedding model.
    """

    model_name = "mock-embed-512"

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * _MOCK_DIM
        for token in _TOKEN_RE.findall(text.lower()):
            if token in _STOPWORDS or len(token) < 2:
                continue
            idx = int(hashlib.md5(token.encode()).hexdigest(), 16) % _MOCK_DIM
            vec[idx] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


def get_embeddings() -> Embeddings:
    settings = get_settings()
    if settings.is_demo:
        return MockEmbeddings()
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=settings.embedding_model, api_key=settings.openai_api_key)


def embedding_model_name() -> str:
    settings = get_settings()
    return MockEmbeddings.model_name if settings.is_demo else settings.embedding_model
