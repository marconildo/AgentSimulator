"""Embedding model.

Embeddings come from the configured **embedding provider** (075-ollama-embeddings):
OpenAI by default (needs a key — UI/DB or env, 078) or a local **Ollama** model
(no key needed). The choice is instance-global because one Chroma collection has
one vector dimension. With OpenAI selected and no effective key, :func:`get_embeddings`
fails fast with :class:`MissingAPIKeyError` rather than falling back to a mock.
"""

from __future__ import annotations

from langchain_core.embeddings import Embeddings

from ..config import (
    MissingAPIKeyError,
    effective_embedding_model,
    effective_embedding_provider,
    effective_ollama_base_url,
    effective_openai_key,
)


def get_embeddings() -> Embeddings:
    provider = effective_embedding_provider()
    model = effective_embedding_model()

    # 075-ollama-embeddings: a local embedding model — no OpenAI key required.
    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings

        return OllamaEmbeddings(model=model, base_url=effective_ollama_base_url())

    # 078-openai-key-ui: the key may come from the UI/DB (DB precedes env).
    key = effective_openai_key()
    if not key:
        raise MissingAPIKeyError()
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=model, api_key=key)


def embedding_model_name() -> str:
    return effective_embedding_model()
