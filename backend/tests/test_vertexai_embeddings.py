"""094-vertex-ai-embeddings — embeddings may run on Google Vertex AI (DB-first,
env fallback) so RAG works with no OpenAI key.

Keyless: env key forced empty, DB values driven directly. No real Vertex AI/OpenAI
calls (construction is mocked/lazy).
"""

from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import app.config as config_mod
from app.config import (
    MissingVertexAICredentialsError,
    Settings,
)
from app.db.store import get_store
from app.main import app
from app.rag import embeddings as emb_mod


def _keyless() -> Settings:
    return Settings(openai_api_key="", _env_file=None)


def _clear() -> None:
    s = get_store()
    for k in (
        "embedding_provider",
        "embedding_model",
        "embedding_signature",
        "openai_api_key",
        "vertexai_project",
        "vertexai_location",
        "vertexai_credentials",
    ):
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


def test_get_embeddings_vertexai_needs_no_openai_key(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)

    # Mock GCP credentials parsing so it doesn't call real Google API
    mock_creds_info = MagicMock()
    monkeypatch.setattr(
        "google.auth.load_credentials_from_dict",
        lambda *args, **kwargs: (mock_creds_info, "test-project"),
    )

    get_store()._set_config_sync("embedding_provider", "vertexai")
    get_store()._set_config_sync("embedding_model", "gemini-embedding-2")
    get_store()._set_config_sync("vertexai_project", "test-project")
    get_store()._set_config_sync("vertexai_location", "us-central1")
    get_store()._set_config_sync(
        "vertexai_credentials", '{"type": "service_account", "client_email": "test@gcp.com"}'
    )

    e = emb_mod.get_embeddings()
    assert e.__class__.__name__ == "VertexAIEmbeddings"
    assert e.location == "us-central1"
    assert e.dimensions == 1536


def test_get_embeddings_vertexai_global_location_override(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    mock_creds_info = MagicMock()
    monkeypatch.setattr(
        "google.auth.load_credentials_from_dict",
        lambda *args, **kwargs: (mock_creds_info, "test-project"),
    )

    get_store()._set_config_sync("embedding_provider", "vertexai")
    get_store()._set_config_sync("embedding_model", "gemini-embedding-2")
    get_store()._set_config_sync("vertexai_project", "test-project")
    get_store()._set_config_sync("vertexai_location", "global")
    get_store()._set_config_sync(
        "vertexai_credentials", '{"type": "service_account", "client_email": "test@gcp.com"}'
    )

    e = emb_mod.get_embeddings()
    assert e.__class__.__name__ == "VertexAIEmbeddings"
    assert e.location == "global"
    assert e.dimensions == 1536


def test_get_embeddings_vertexai_empty_location_defaults_to_global(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    mock_creds_info = MagicMock()
    monkeypatch.setattr(
        "google.auth.load_credentials_from_dict",
        lambda *args, **kwargs: (mock_creds_info, "test-project"),
    )

    get_store()._set_config_sync("embedding_provider", "vertexai")
    get_store()._set_config_sync("embedding_model", "gemini-embedding-2")
    get_store()._set_config_sync("vertexai_project", "test-project")
    get_store()._set_config_sync("vertexai_location", "")
    get_store()._set_config_sync(
        "vertexai_credentials", '{"type": "service_account", "client_email": "test@gcp.com"}'
    )

    e = emb_mod.get_embeddings()
    assert e.__class__.__name__ == "VertexAIEmbeddings"
    assert e.location == "global"
    assert e.dimensions == 1536


# --- AC2: settings round-trip ------------------------------------------------


def test_embedding_settings_round_trip_vertexai(client):
    put = client.put(
        "/api/settings/embeddings", json={"provider": "vertexai", "model": "gemini-embedding-2"}
    )
    assert put.status_code == 200
    got = client.get("/api/settings/embeddings").json()
    assert got["provider"] == "vertexai"
    assert got["model"] == "gemini-embedding-2"


# --- AC3: auto-rebuild signature ---------------------------------------------


def test_index_matches_model_false_on_vertexai_switch(monkeypatch):
    from app.rag import store as store_mod

    # Mock index dimensions to be 1536 (matching gemini-embedding-2)
    monkeypatch.setattr(store_mod, "_persisted_dim", lambda: 1536)

    class _E:
        def embed_query(self, q):
            return [0.0] * 1536

    monkeypatch.setattr(store_mod, "get_embeddings", lambda: _E())

    # When signature in DB matches, index matches model is True
    get_store()._set_config_sync("embedding_provider", "vertexai")
    get_store()._set_config_sync("embedding_model", "gemini-embedding-2")
    get_store()._set_config_sync("embedding_signature", "vertexai:gemini-embedding-2")
    assert store_mod.index_matches_model() is True

    # If signature is openai:text-embedding-3-small, they don't match
    get_store()._set_config_sync("embedding_signature", "openai:text-embedding-3-small")
    assert store_mod.index_matches_model() is False


# --- AC5: boot safety ---------------------------------------------------------


def test_vertexai_embeddings_boot_safe_without_credentials(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    get_store()._set_config_sync("embedding_provider", "vertexai")
    get_store()._set_config_sync("embedding_model", "gemini-embedding-2")

    # Missing credentials should raise MissingVertexAICredentialsError
    with pytest.raises(MissingVertexAICredentialsError):
        emb_mod.get_embeddings()


def test_embedding_settings_rejects_unknown_vertexai_model(client):
    put = client.put(
        "/api/settings/embeddings", json={"provider": "vertexai", "model": "invalid-google-model"}
    )
    assert put.status_code == 422


def test_embedding_settings_defaults_vertexai_model(client):
    # Set model to openai model first
    get_store()._set_config_sync("embedding_model", "text-embedding-3-small")
    # Switch provider only, should auto-default to gemini-embedding-2
    put = client.put("/api/settings/embeddings", json={"provider": "vertexai"})
    assert put.status_code == 200
    assert put.json()["model"] == "gemini-embedding-2"


def test_patched_vertexai_embeddings_returns_one_vector_per_text(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    mock_creds_info = MagicMock()
    monkeypatch.setattr(
        "google.auth.load_credentials_from_dict",
        lambda *args, **kwargs: (mock_creds_info, "test-project"),
    )

    get_store()._set_config_sync("embedding_provider", "vertexai")
    get_store()._set_config_sync("embedding_model", "gemini-embedding-2")
    get_store()._set_config_sync("vertexai_project", "test-project")
    get_store()._set_config_sync("vertexai_location", "")
    get_store()._set_config_sync(
        "vertexai_credentials", '{"type": "service_account", "client_email": "test@gcp.com"}'
    )

    e = emb_mod.get_embeddings()

    # Mock the internal embed call of VertexAIEmbeddings.
    # To simulate the google-genai SDK bug, embed() when called with list of N texts
    # returns only a list of 1 embedding vector.
    def mock_embed(self, texts, embeddings_task_type=None, dimensions=None, title=None):
        # Always returns exactly 1 vector [0.1]*1536 regardless of input list length
        return [[0.1] * 1536]

    # Monkeypatch the embed method on the class because e is a Pydantic model
    from langchain_google_vertexai import VertexAIEmbeddings

    monkeypatch.setattr(VertexAIEmbeddings, "embed", mock_embed)

    # Now, calling embed_documents on multiple texts:
    texts = ["hello", "world", "test"]
    embeddings = e.embed_documents(texts)

    # It must return 3 embeddings (one for each text)
    assert len(embeddings) == len(texts)
    assert all(len(emb) == 1536 for emb in embeddings)
