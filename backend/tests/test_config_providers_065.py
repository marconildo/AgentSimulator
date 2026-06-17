"""065-provider-and-model-refresh — ``/api/config`` advertises the LLM
providers (OpenAI active, Ollama a disabled preview) so the Agent Anatomy dialog
never hardcodes provider proper nouns. Purely additive — existing model keys stay.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.llm.models import model_ids
from app.main import app


def test_config_advertises_providers():
    """AC4 — exactly two providers: openai (available) and ollama (preview)."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    providers = body["providers"]
    assert isinstance(providers, list)
    by_id = {p["id"]: p for p in providers}
    assert set(by_id) == {"openai", "ollama"}
    assert by_id["openai"]["available"] is True
    assert by_id["ollama"]["available"] is False
    for row in providers:
        assert isinstance(row["label"], str) and row["label"]


def test_config_default_provider_is_openai():
    """AC4 — the resolved default provider is the only available one."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    assert body["default_provider"] == "openai"


def test_config_still_exposes_models_mirror():
    """AC4 — adding providers did not disturb the model list mirror."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    assert {m["id"] for m in body["models"]} == model_ids()
    assert body["default_model"] in model_ids()
