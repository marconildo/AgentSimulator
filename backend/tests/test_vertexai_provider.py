"""089-vertex-ai-provider — API and provider tests for Vertex AI.

Covers:
  - GET/PUT /api/settings/vertexai settings persistence and defaults (AC5)
  - PUT /api/settings/vertexai connection validation / simple API call (AC6)
  - get_provider() routing and instantiation for vertexai without OpenAI key (AC2)
  - /api/chat model validation scoped to Vertex AI (AC4)
  - Agent provider PATCH persistence (AC3)
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.config import Settings
from app.llm import provider as provider_mod
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _keyless() -> Settings:
    return Settings(openai_api_key="", _env_file=None)


# --- settings persistence (AC5) ----------------------------------------------


def test_get_vertexai_settings_returns_default(client):
    body = client.get("/api/settings/vertexai").json()
    assert "project" in body
    assert body["location"] == "global"
    assert body["has_credentials"] is False
    assert body["masked_credentials"] is None


def test_put_then_get_vertexai_settings_round_trip(client, monkeypatch):
    # Mock validation call so connection test passes
    class MockChat:
        def __init__(self, *args, **kwargs):
            pass

        async def ainvoke(self, *args, **kwargs):
            class FakeMessage:
                content = "hello"
                usage_metadata = None

            return FakeMessage()

    monkeypatch.setattr(main_mod, "validate_vertexai_connection", lambda *a, **kw: (True, None))

    payload = {
        "project": "my-gcp-project",
        "location": "us-east1",
        "credentials": '{"type": "service_account", "project_id": "my-gcp-project", "client_email": "my-service-account@my-gcp-project.iam.gserviceaccount.com"}',
    }
    put = client.put("/api/settings/vertexai", json=payload)
    assert put.status_code == 200
    res = put.json()
    assert res["ok"] is True
    assert res["project"] == "my-gcp-project"
    assert res["location"] == "us-east1"
    assert res["has_credentials"] is True
    assert res["masked_credentials"] == "my-service-account@my-gcp-project.iam.gserviceaccount.com"

    got = client.get("/api/settings/vertexai").json()
    assert got["project"] == "my-gcp-project"
    assert got["location"] == "us-east1"
    assert got["has_credentials"] is True
    assert got["masked_credentials"] == "my-service-account@my-gcp-project.iam.gserviceaccount.com"


def test_put_vertexai_settings_rejects_blank_project_or_location(client):
    payload = {
        "project": "   ",
        "location": "us-central1",
        "credentials": '{"type": "service_account", "client_email": "my-service-account@my-gcp-project.iam.gserviceaccount.com"}',
    }
    assert client.put("/api/settings/vertexai", json=payload).status_code == 422


def test_vertexai_settings_mandatory_credentials(client):
    # Clean up DB configs first to ensure no existing creds
    import asyncio

    from app.db.store import get_store

    asyncio.run(get_store().set_config("vertexai_credentials", ""))

    payload = {
        "project": "my-project",
        "location": "us-central1",
        "credentials": "   ",
    }
    assert client.put("/api/settings/vertexai", json=payload).status_code == 422


def test_vertexai_settings_update_location_keeps_credentials(client, monkeypatch):
    monkeypatch.setattr(main_mod, "validate_vertexai_connection", lambda *a, **kw: (True, None))

    # First, save a valid config with credentials
    payload = {
        "project": "my-project",
        "location": "us-central1",
        "credentials": '{"type": "service_account", "client_email": "foo@bar.com"}',
    }
    assert client.put("/api/settings/vertexai", json=payload).status_code == 200

    # Now, save again with blank credentials but new location
    payload = {
        "project": "my-project",
        "location": "global",
        "credentials": "",
    }
    res = client.put("/api/settings/vertexai", json=payload)
    assert res.status_code == 200
    assert res.json()["location"] == "global"
    assert res.json()["has_credentials"] is True
    assert res.json()["masked_credentials"] == "foo@bar.com"

    # Verify via GET that location is updated and credentials are preserved
    got = client.get("/api/settings/vertexai").json()
    assert got["location"] == "global"
    assert got["has_credentials"] is True
    assert got["masked_credentials"] == "foo@bar.com"

    # Now, save again with client_email as credentials (masked prefill)
    payload = {
        "project": "my-project",
        "location": "us-east4",
        "credentials": "foo@bar.com",
    }
    res = client.put("/api/settings/vertexai", json=payload)
    assert res.status_code == 200
    assert res.json()["location"] == "us-east4"
    assert res.json()["masked_credentials"] == "foo@bar.com"


# --- connection validation check (AC6) ---------------------------------------


def test_put_settings_vertexai_validation_failure(client, monkeypatch):
    # Mock validation call to return failure
    monkeypatch.setattr(
        main_mod,
        "validate_vertexai_connection",
        lambda *a, **kw: (False, "Invalid credentials or project permissions"),
    )

    payload = {
        "project": "bad-project",
        "location": "us-central1",
        "credentials": '{"type": "service_account", "client_email": "bad-email@gcp.com"}',
    }
    put = client.put("/api/settings/vertexai", json=payload)
    assert put.status_code == 200
    res = put.json()
    assert res["ok"] is False
    assert "Invalid credentials" in res["error"]


# --- provider factory routing (AC2) ------------------------------------------


def test_get_provider_vertexai_does_not_require_openai_key(monkeypatch):
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)

    from app.db.store import get_store

    monkeypatch.setattr(
        get_store(),
        "_get_config_sync",
        lambda key: (
            '{"type": "service_account", "client_email": "foo@bar.com"}'
            if key == "vertexai_credentials"
            else None
        ),
    )

    # We must mock ChatVertexAI imports so it doesn't try to touch real GCP libraries during routing test
    class MockChatVertexAI:
        def __init__(self, **kwargs):
            self.model = kwargs.get("model")
            self.project = kwargs.get("project")
            self.location = kwargs.get("location")

    import sys
    from types import ModuleType

    mock_module = ModuleType("langchain_google_vertexai")
    mock_module.ChatVertexAI = MockChatVertexAI
    sys.modules["langchain_google_vertexai"] = mock_module

    p = provider_mod.get_provider(
        provider="vertexai",
        model="gemini-2.5-flash",
    )
    assert p.name == "vertexai"
    assert p.model_name == "gemini-2.5-flash"


def test_vertexai_provider_creation_missing_key(monkeypatch):
    from app.config import MissingVertexAICredentialsError
    from app.db.store import get_store

    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    monkeypatch.setattr(get_store(), "_get_config_sync", lambda key: None)

    with pytest.raises(MissingVertexAICredentialsError):
        provider_mod.get_provider(
            provider="vertexai",
            model="gemini-2.5-flash",
        )


# --- allowlist model validation & PATCH (AC3/AC4) -----------------------------


def test_chat_accepts_curated_model_for_vertexai(client, monkeypatch):
    async def _fake_run_agent(*args, **kwargs):
        assert kwargs.get("provider") == "vertexai"
        return "ok"

    monkeypatch.setattr(main_mod, "run_agent", _fake_run_agent)
    resp = client.post(
        "/api/chat",
        json={"message": "hi", "provider": "vertexai", "model": "gemini-2.5-flash"},
    )
    assert resp.status_code != 422


def test_chat_rejects_unlisted_model_for_vertexai(client):
    resp = client.post(
        "/api/chat",
        json={"message": "hi", "provider": "vertexai", "model": "gpt-4.1-mini"},
    )
    assert resp.status_code == 422
    assert "not allowed for provider" in resp.json()["detail"]["error"]


def _new_agent(client) -> str:
    return client.post("/api/agents", json={"name": "vertex-agent"}).json()["id"]


def test_agent_provider_vertexai_persistence_via_patch(client):
    aid = _new_agent(client)
    try:
        patched = client.patch(
            f"/api/agents/{aid}", json={"provider": "vertexai", "model": "gemini-2.5-flash"}
        )
        assert patched.status_code == 200
        assert patched.json()["provider"] == "vertexai"
        assert patched.json()["model"] == "gemini-2.5-flash"
    finally:
        client.delete(f"/api/agents/{aid}")


@pytest.mark.vertexai
async def test_real_vertexai_run():
    # AC7 — a real Vertex AI call streams a non-empty answer over the canonical thread.
    import os

    from langchain_core.messages import HumanMessage

    from app.db.store import get_store

    project = os.environ.get("VERTEXAI_TEST_PROJECT", "")
    location = os.environ.get("VERTEXAI_TEST_LOCATION", "us-central1")
    credentials_json = os.environ.get("VERTEXAI_TEST_CREDENTIALS", "")

    store = get_store()
    await store.set_config("vertexai_project", project)
    await store.set_config("vertexai_location", location)
    if credentials_json:
        await store.set_config("vertexai_credentials", credentials_json)

    p = provider_mod.get_provider(provider="vertexai", model="gemini-2.5-flash")
    chunks = []
    async for tok in p.stream_answer(
        system="You are a helpful assistant. Answer in one short sentence.",
        thread=[HumanMessage(content="Say hello.")],
    ):
        chunks.append(tok)
    assert "".join(chunks).strip()
