"""074-ollama-provider — API surface: settings, model listing, allowlist scope.

Keyless (no model/embeddings). The Ollama HTTP probe is mocked, so these run in
CI with no local server. Covers:
  - GET/PUT /api/settings/ollama round-trip + default (AC5)
  - GET /api/ollama/models parsing + unreachable handling (AC6)
  - /api/chat allowlist scoped to OpenAI; POST/PATCH agents carry provider (AC3/AC4)
"""

from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


# --- settings (AC5) ----------------------------------------------------------


def test_get_ollama_settings_returns_default(client):
    body = client.get("/api/settings/ollama").json()
    assert body["base_url"]  # env default when nothing persisted


def test_put_then_get_ollama_settings_round_trip(client):
    put = client.put("/api/settings/ollama", json={"base_url": "http://host.docker.internal:11434"})
    assert put.status_code == 200
    assert put.json()["base_url"] == "http://host.docker.internal:11434"
    got = client.get("/api/settings/ollama").json()
    assert got["base_url"] == "http://host.docker.internal:11434"


def test_put_ollama_settings_rejects_blank(client):
    assert client.put("/api/settings/ollama", json={"base_url": "   "}).status_code == 422


# --- model listing (AC6) -----------------------------------------------------


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    """Stand-in for httpx.AsyncClient that returns a canned /api/tags body."""

    def __init__(self, payload=None, raise_exc=None, **_):
        self._payload = payload
        self._raise = raise_exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url):
        if self._raise is not None:
            raise self._raise
        return _FakeResponse(self._payload)


def test_list_ollama_models_parses_tags(client, monkeypatch):
    payload = {"models": [{"name": "llama3.1", "size": 42}, {"name": "qwen2.5"}]}
    monkeypatch.setattr(main_mod.httpx, "AsyncClient", lambda **kw: _FakeClient(payload=payload))
    body = client.get("/api/ollama/models", params={"base_url": "http://x:11434"}).json()
    assert body["reachable"] is True
    assert [m["id"] for m in body["models"]] == ["llama3.1", "qwen2.5"]


def test_list_ollama_models_unreachable_is_structured(client, monkeypatch):
    monkeypatch.setattr(
        main_mod.httpx,
        "AsyncClient",
        lambda **kw: _FakeClient(raise_exc=httpx.ConnectError("refused")),
    )
    resp = client.get("/api/ollama/models", params={"base_url": "http://nope:11434"})
    assert resp.status_code == 200  # not a 500
    body = resp.json()
    assert body["reachable"] is False
    assert body["models"] == []
    assert body["error"]


# --- allowlist scope + agent provider (AC3/AC4) ------------------------------


def test_chat_rejects_unlisted_openai_model(client):
    # OpenAI provider: an unlisted model is a 422 (default provider is openai).
    resp = client.post("/api/chat", json={"message": "hi", "model": "totally-made-up"})
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "model not in allowlist"


def test_chat_accepts_arbitrary_model_for_ollama(client, monkeypatch):
    # Ollama provider: any non-empty model passes the allowlist gate. Stub the
    # agent run (no local server in CI) so we exercise only the validation path;
    # a non-422 status means validation let the unlisted model through.
    async def _fake_run_agent(*args, **kwargs):
        assert kwargs.get("provider") == "ollama"
        return "ok"

    monkeypatch.setattr(main_mod, "run_agent", _fake_run_agent)
    resp = client.post(
        "/api/chat",
        json={"message": "hi", "provider": "ollama", "model": "llama3.1"},
    )
    assert resp.status_code != 422


def test_chat_rejects_blank_model(client):
    resp = client.post("/api/chat", json={"message": "hi", "provider": "ollama", "model": "  "})
    assert resp.status_code == 422


def test_chat_rejects_unknown_provider(client):
    resp = client.post("/api/chat", json={"message": "hi", "provider": "bedrock"})
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "unknown provider"


def _new_agent(client) -> str:
    """Create a throwaway non-default agent so PATCH tests never mutate the
    shared seed default (whose model other tests assert against)."""
    return client.post("/api/agents", json={"name": "throwaway"}).json()["id"]


def test_agent_provider_round_trips_via_patch(client):
    aid = _new_agent(client)
    try:
        patched = client.patch(f"/api/agents/{aid}", json={"provider": "ollama"})
        assert patched.status_code == 200
        assert patched.json()["provider"] == "ollama"
    finally:
        client.delete(f"/api/agents/{aid}")


def test_patch_skips_allowlist_for_ollama_agent(client):
    aid = _new_agent(client)
    try:
        client.patch(f"/api/agents/{aid}", json={"provider": "ollama"})
        # Now the agent is ollama-bound: setting an arbitrary model must NOT 422.
        resp = client.patch(f"/api/agents/{aid}", json={"model": "llama3.1:70b"})
        assert resp.status_code == 200
        assert resp.json()["model"] == "llama3.1:70b"
    finally:
        client.delete(f"/api/agents/{aid}")


def test_patch_rejects_unknown_provider(client):
    aid = _new_agent(client)
    try:
        resp = client.patch(f"/api/agents/{aid}", json={"provider": "bedrock"})
        assert resp.status_code == 422
    finally:
        client.delete(f"/api/agents/{aid}")
