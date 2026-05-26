"""Embedding model.

The app is OpenAI-only: embeddings always come from OpenAI's embedding model.
With no API key configured, :func:`get_embeddings` fails fast with
:class:`MissingAPIKeyError` rather than falling back to a mock.
"""

from __future__ import annotations

from langchain_core.embeddings import Embeddings

from ..config import MissingAPIKeyError, get_settings


def get_embeddings() -> Embeddings:
    settings = get_settings()
    if not settings.has_openai_key:
        raise MissingAPIKeyError()
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=settings.embedding_model, api_key=settings.openai_api_key)


def embedding_model_name() -> str:
    return get_settings().embedding_model
