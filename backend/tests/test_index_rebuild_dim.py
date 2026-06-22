"""Regression: rebuilding the corpus index when the persisted vector dimension
no longer matches the live embedding model must succeed.

Reproduces the production startup failure seen with a stale Chroma volume::

    [startup] Could not build index:
        InvalidArgumentError('Collection expecting embedding with dimension of 512, got 1536')

A Chroma collection bakes its vector dimension in at build time, so an embedding
model swap to a different dimension cannot be fixed by deleting *documents*
(``build_index``'s delete-by-``corpus`` path) — the whole collection has to be
dropped and recreated. ``build_index`` must self-heal instead of leaving RAG
empty.

Runs keyless via a fake, fixed-dimension embedding function (no network).
"""

from __future__ import annotations

import hashlib

from langchain_core.embeddings import Embeddings


class _FakeEmbeddings(Embeddings):
    """Deterministic embeddings of a fixed dimension — no key, no network."""

    def __init__(self, dim: int) -> None:
        self.dim = dim

    def _vec(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode()).digest()
        return [digest[i % len(digest)] / 255.0 for i in range(self.dim)]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


def test_build_index_self_heals_on_dimension_change(monkeypatch, tmp_path):
    from app.config import get_settings
    from app.rag import ingest as ingest_mod
    from app.rag import store as store_mod

    # Use a throwaway chroma dir so we never clobber the session index.
    monkeypatch.setattr(get_settings(), "chroma_dir", str(tmp_path / "chroma"))

    dim = {"value": 8}

    def _factory() -> Embeddings:
        return _FakeEmbeddings(dim["value"])

    # Both store.get_vectorstore and ingest.build_index resolve embeddings through
    # this name (imported `from .embeddings import get_embeddings`).
    monkeypatch.setattr(store_mod, "get_embeddings", _factory)
    monkeypatch.setattr(ingest_mod, "get_embeddings", _factory)

    # Build the index at dimension 8.
    store_mod.reset_vectorstore_cache()
    assert ingest_mod.build_index() > 0
    assert store_mod._persisted_dim() == 8

    # The embedding model swaps to a different dimension. The persisted collection
    # is still pinned at 8, so a naive add raises "...dimension of 8, got 16".
    dim["value"] = 16
    store_mod.reset_vectorstore_cache()

    # build_index must drop + recreate the collection and rebuild — not raise.
    assert ingest_mod.build_index() > 0
    assert store_mod._persisted_dim() == 16

    # And the rebuilt corpus is searchable in the new embedding space.
    assert store_mod.get_vectorstore().similarity_search("agent", k=1)

    store_mod.reset_vectorstore_cache()
