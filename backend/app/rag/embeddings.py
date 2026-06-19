"""Embedding model.

The app is OpenAI-only: embeddings always come from OpenAI's embedding model.
With no API key configured, :func:`get_embeddings` fails fast with
:class:`MissingAPIKeyError` rather than falling back to a mock.
"""

from __future__ import annotations

from langchain_core.embeddings import Embeddings

from ..config import MissingAPIKeyError, effective_openai_key, get_settings


def get_embeddings() -> Embeddings:
    settings = get_settings()
    # 076-openai-key-ui: the key may come from the UI/DB (DB precedes env).
    key = effective_openai_key()
    if not key:
        raise MissingAPIKeyError()
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=settings.embedding_model, api_key=key)


def embedding_model_name() -> str:
    return get_settings().embedding_model
