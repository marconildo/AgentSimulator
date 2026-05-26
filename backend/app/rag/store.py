"""Chroma vector store wiring.

A single persistent collection configured for cosine similarity, so the
distances Chroma returns map cleanly to a 0..1 similarity score in the UI.
"""

from __future__ import annotations

from functools import lru_cache

from langchain_chroma import Chroma

from ..config import get_settings
from .embeddings import get_embeddings

COLLECTION_NAME = "ai_engineering"


@lru_cache
def get_vectorstore() -> Chroma:
    settings = get_settings()
    settings.chroma_path.mkdir(parents=True, exist_ok=True)
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=get_embeddings(),
        persist_directory=str(settings.chroma_path),
        # Cosine space => distance in [0, 2]; similarity = 1 - distance.
        collection_metadata={"hnsw:space": "cosine"},
    )


def is_indexed() -> bool:
    """True if the collection already has at least one document."""
    store = get_vectorstore()
    try:
        return len(store.get(limit=1).get("ids", [])) > 0
    except Exception:
        return False
