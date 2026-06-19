"""078-openai-key-ui — the OpenAI key may come from the UI/DB (DB precedes env).

Keyless tests: they force the env key empty and drive the DB value directly, so
they run in CI without a real key. The OpenAI HTTP calls (connection test + model
listing) are mocked.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

import app.config as config_mod
import app.main as main_mod
from app.config import MissingAPIKeyError, Settings, effective_openai_key
from app.db.store import get_store
from app.llm import provider as provider_mod
from app.main import app


@pytest.fixture(autouse=True)
def _clear_openai_db_key() -> Iterator[None]:
    # The app DB is shared across the session; never let a DB-saved key from one
    # test leak into another (e.g. the real-@openai tests, which must use the env
    # key, not a bogus DB one). Clear before and after each test here.
    get_store()._set_config_sync("openai_api_key", "")
    yield
    get_store()._set_config_sync("openai_api_key", "")


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _keyless() -> Settings:
    return Settings(openai_api_key="", _env_file=None)


def _clear_db_key():
    get_store()._set_config_sync("openai_api_key", "")


# --- AC1: effective key precedence + fail fast ------------------------------


def test_effective_key_prefers_db_over_env(monkeypatch):
    monkeypatch.setattr(config_mod, "get_settings", lambda: Settings(openai_api_key="env-key"))
    get_store()._set_config_sync("openai_api_key", "db-key")
    assert effective_openai_key() == "db-key"
    _clear_db_key()
    # With the DB value cleared, the env fallback wins again.
    assert effective_openai_key() == "env-key"


def test_provider_fails_fast_when_no_effective_key(monkeypatch):
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    _clear_db_key()
    with pytest.raises(MissingAPIKeyError):
        provider_mod.get_provider()


def test_provider_uses_db_key_without_env(monkeypatch):
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    get_store()._set_config_sync("openai_api_key", "sk-db-1234")
    # Should construct an OpenAI provider (no MissingAPIKeyError) off the DB key.
    p = provider_mod.get_provider(provider="openai", model="gpt-4.1-mini")
    assert p.name == "openai"
    _clear_db_key()


# --- AC2: settings round-trip + masking -------------------------------------


def test_put_get_openai_settings_masks_key(client):
    _clear_db_key()
    put = client.put("/api/settings/openai", json={"api_key": "sk-abcdefishjklmnop1234"})
    assert put.status_code == 200
    got = client.get("/api/settings/openai").json()
    assert got["has_key"] is True
    # Never the full key.
    assert "sk-abcdefishjklmnop1234" not in str(got)
    assert got["masked"].endswith("1234")
    _clear_db_key()


def test_blank_put_clears_the_key(client):
    client.put("/api/settings/openai", json={"api_key": "sk-zzzz9999"})
    client.put("/api/settings/openai", json={"api_key": "   "})
    # Cleared ⇒ no DB key (the env fallback may still report has_key, so we assert
    # the DB value itself was cleared).
    assert get_store()._get_config_sync("openai_api_key") in (None, "")


# --- AC4: dynamic model listing ---------------------------------------------


class _FakeModels:
    def __init__(self, ids):
        self.data = [type("M", (), {"id": i}) for i in ids]


def test_openai_models_lists_chat_models(client, monkeypatch):
    get_store()._set_config_sync("openai_api_key", "sk-db-1234")

    class _FakeOpenAI:
        def __init__(self, *a, **k):
            self.models = self

        def list(self):
            return _FakeModels(["gpt-4.1-mini", "o3-mini", "text-embedding-3-small", "whisper-1"])

    monkeypatch.setattr(main_mod, "_openai_client", lambda key: _FakeOpenAI())
    body = client.get("/api/openai/models").json()
    assert body["reachable"] is True
    ids = [m["id"] for m in body["models"]]
    assert "gpt-4.1-mini" in ids and "o3-mini" in ids
    assert "text-embedding-3-small" not in ids and "whisper-1" not in ids
    _clear_db_key()


def test_openai_models_no_key_is_structured(client, monkeypatch):
    _clear_db_key()
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    body = client.get("/api/openai/models").json()
    assert body["reachable"] is False
    assert body["models"] == []


# --- AC5: relaxed validation (any non-empty OpenAI model) -------------------


def test_chat_accepts_unlisted_openai_model_when_key_present(client, monkeypatch):
    async def _fake_run_agent(*a, **k):
        return "ok"

    monkeypatch.setattr(main_mod, "run_agent", _fake_run_agent)
    resp = client.post("/api/chat", json={"message": "hi", "model": "gpt-4.1-custom-tier"})
    assert resp.status_code != 422


def test_chat_rejects_blank_model(client):
    resp = client.post("/api/chat", json={"message": "hi", "model": "   "})
    assert resp.status_code == 422
