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


def reset_vectorstore_cache() -> None:
    """Drop the cached Chroma handle so the next call re-opens the collection.

    The handle caches the collection's id at construction. If the collection is
    reset/rebuilt by another process (e.g. ``python -m app.rag.ingest`` while the
    server is running), this handle goes stale and queries raise
    "Collection [<id>] does not exist". Clearing the cache forces a fresh
    get-or-create against the current on-disk collection.
    """
    get_vectorstore.cache_clear()


def reset_collection() -> None:
    """Drop and recreate the underlying Chroma collection (clears ALL vectors).

    Needed when the embedding *space* changed: Chroma bakes the vector dimension
    into the collection at build time, so a model swap to a different dimension
    can't be repaired by deleting documents (``build_index``'s delete-by-``corpus``
    path) — the whole collection must be recreated. This unavoidably invalidates
    user uploads too: their old-space vectors are meaningless under the new model.

    The cache is cleared first so the recreated collection is opened with the
    *current* embedding function, not a handle that captured the old one.
    """
    reset_vectorstore_cache()
    try:
        get_vectorstore().reset_collection()
    except Exception:  # noqa: BLE001 - an empty/new collection is fine to "reset"
        pass
    reset_vectorstore_cache()


def is_indexed() -> bool:
    """True if the collection already has at least one document.

    Opening the store needs the embedding function, which requires a key; with
    no key (or any other failure) we simply report "not indexed" so callers like
    ``/api/health`` stay inspectable.
    """
    try:
        store = get_vectorstore()
        return len(store.get(limit=1).get("ids", [])) > 0
    except Exception:
        return False


def _persisted_dim() -> int | None:
    """Vector dimension of the persisted index, or None if empty/unavailable."""
    store = get_vectorstore()
    try:
        embeddings = store.get(limit=1, include=["embeddings"]).get("embeddings")
    except Exception:
        return None
    if embeddings is None or len(embeddings) == 0:
        return None
    return len(embeddings[0])


def index_matches_model() -> bool:
    """True iff a persisted index exists and matches the active embedding model.

    The vector dimension is baked into the collection at build time (e.g. 1536
    for ``text-embedding-3-small``, 3072 for ``text-embedding-3-large``). Changing
    ``EMBEDDING_MODEL`` therefore leaves an index whose dimension no longer matches
    the live model, which makes search fail or return nonsense. Comparing
    dimensions lets the app detect that and rebuild. If the current dimension can't
    be determined, we assume a match rather than force a rebuild.

    075-ollama-embeddings: the dimension check alone misses a provider/model swap
    whose dimensions happen to coincide, so we ALSO compare the stored
    `provider:model` signature (written at build time). A signature change forces a
    rebuild even at equal dimensions.
    """
    persisted = _persisted_dim()
    if persisted is None:
        return False
    # 075: a recorded signature that no longer matches the active provider/model
    # means the index belongs to a different embedding space → rebuild.
    try:
        from ..config import EMBEDDING_SIGNATURE_CONFIG_KEY, embedding_signature
        from ..db.store import get_store

        stored_sig = (get_store()._get_config_sync(EMBEDDING_SIGNATURE_CONFIG_KEY) or "").strip()
        if stored_sig and stored_sig != embedding_signature():
            return False
    except Exception:  # noqa: BLE001 - signature check is best-effort
        pass
    try:
        current = len(get_embeddings().embed_query("dimension probe"))
    except Exception:
        return True
    return persisted == current
