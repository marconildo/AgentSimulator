"""075-ollama-embeddings — embeddings may run on a local Ollama model (DB-first,
env fallback) so RAG works with no OpenAI key.

Keyless: env key forced empty, DB values driven directly. No real Ollama/OpenAI
calls (construction is lazy; the integration run is marked ``@pytest.mark.ollama``).
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

import app.config as config_mod
from app.config import (
    MissingAPIKeyError,
    Settings,
    effective_embedding_model,
    effective_embedding_provider,
    embedding_signature,
)
from app.db.store import get_store
from app.main import app
from app.rag import embeddings as emb_mod


def _keyless() -> Settings:
    return Settings(openai_api_key="", _env_file=None)


def _clear() -> None:
    s = get_store()
    for k in ("embedding_provider", "embedding_model", "embedding_signature", "openai_api_key"):
        s._set_config_sync(k, "")


@pytest.fixture(autouse=True)
def _clean() -> Iterator[None]:
    _clear()
    yield
    _clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


# --- AC1: factory routing ----------------------------------------------------


def test_get_embeddings_ollama_needs_no_openai_key(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    get_store()._set_config_sync("embedding_provider", "ollama")
    get_store()._set_config_sync("embedding_model", "nomic-embed-text")
    e = emb_mod.get_embeddings()
    assert e.__class__.__name__ == "OllamaEmbeddings"


def test_get_embeddings_openai_still_fails_fast(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    # provider defaults to openai (DB cleared) ⇒ needs a key ⇒ fail fast.
    with pytest.raises(MissingAPIKeyError):
        emb_mod.get_embeddings()


def test_effective_embedding_resolution_db_precedes_env(monkeypatch):
    monkeypatch.setattr(
        config_mod,
        "get_settings",
        lambda: Settings(embedding_provider="openai", embedding_model="text-embedding-3-small"),
    )
    assert effective_embedding_provider() == "openai"
    get_store()._set_config_sync("embedding_provider", "ollama")
    get_store()._set_config_sync("embedding_model", "mxbai-embed-large")
    assert effective_embedding_provider() == "ollama"
    assert effective_embedding_model() == "mxbai-embed-large"
    assert embedding_signature() == "ollama:mxbai-embed-large"


# --- AC2: settings round-trip ------------------------------------------------


def test_embedding_settings_round_trip(client):
    default = client.get("/api/settings/embeddings").json()
    assert default["provider"] == "openai"  # env default
    put = client.put(
        "/api/settings/embeddings", json={"provider": "ollama", "model": "nomic-embed-text"}
    )
    assert put.status_code == 200
    got = client.get("/api/settings/embeddings").json()
    assert got["provider"] == "ollama"
    assert got["model"] == "nomic-embed-text"


def test_embedding_settings_rejects_unknown_provider(client):
    assert client.put("/api/settings/embeddings", json={"provider": "bedrock"}).status_code == 422


# --- AC3: auto-rebuild on signature change -----------------------------------


def test_index_matches_model_false_on_signature_change(monkeypatch):
    from app.rag import store as store_mod

    # Same dimension on both sides, so only the signature can force a rebuild.
    monkeypatch.setattr(store_mod, "_persisted_dim", lambda: 768)

    class _E:
        def embed_query(self, q):
            return [0.0] * 768

    monkeypatch.setattr(store_mod, "get_embeddings", lambda: _E())
    get_store()._set_config_sync("embedding_signature", "openai:text-embedding-3-small")
    get_store()._set_config_sync("embedding_provider", "ollama")
    get_store()._set_config_sync("embedding_model", "nomic-embed-text")
    assert store_mod.index_matches_model() is False


def test_index_matches_model_true_when_signature_matches(monkeypatch):
    from app.rag import store as store_mod

    monkeypatch.setattr(store_mod, "_persisted_dim", lambda: 768)

    class _E:
        def embed_query(self, q):
            return [0.0] * 768

    monkeypatch.setattr(store_mod, "get_embeddings", lambda: _E())
    get_store()._set_config_sync("embedding_provider", "ollama")
    get_store()._set_config_sync("embedding_model", "nomic-embed-text")
    get_store()._set_config_sync("embedding_signature", "ollama:nomic-embed-text")
    assert store_mod.index_matches_model() is True


# --- AC5: ollama-backed store constructs without a reachable server ----------


def test_ollama_embeddings_store_constructs_without_server(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    get_store()._set_config_sync("embedding_provider", "ollama")
    get_store()._set_config_sync("embedding_model", "nomic-embed-text")
    # Construction must not require a reachable server (lazy connect on embed).
    e = emb_mod.get_embeddings()
    assert e is not None
