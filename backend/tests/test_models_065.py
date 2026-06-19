"""065-provider-and-model-refresh — the curated model list is refreshed to the
4.1 + 5 families (gpt-5.5 included) and the gpt-4o family is dropped; the server
default moves to gpt-4.1-mini.

These tests exercise the allowlist + config + request-validation paths only, so
they run without an OPENAI_API_KEY (the 422 guard fires before any model call).
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from app.llm.models import model_ids
from app.main import app

EXPECTED_MODEL_IDS = {
    "gpt-4.1-nano",
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-5-nano",
    "gpt-5-mini",
    "gpt-5",
    "gpt-5.5",
}


def test_curated_model_ids_are_4_1_and_up():
    """AC1 — the allowlist is exactly the 4.1 + 5 families; no gpt-4o family."""
    assert model_ids() == EXPECTED_MODEL_IDS
    assert "gpt-4o" not in model_ids()
    assert "gpt-4o-mini" not in model_ids()


def test_default_model_is_gpt_4_1_mini_and_listed():
    """AC2 — the server default moved off the removed 4o-mini to gpt-4.1-mini,
    and it is a member of the curated allowlist."""
    default = get_settings().llm_model
    assert default == "gpt-4.1-mini"
    assert default in model_ids()


def test_chat_no_longer_hard_gates_on_curated_allowlist():
    """078-openai-key-ui — the curated list stopped being a hard gate (OpenAI
    models are listed live now). Any non-empty model id is accepted (no 422 from
    an allowlist guard); the curated payload survives only as the FE prefill."""
    with TestClient(app) as client:
        for model in ("gpt-4o-mini", "gpt-5.5", "gpt-4.1-some-future-tier"):
            resp = client.post("/api/chat", json={"message": "hi", "model": model})
            # Never a 422 from the (now-removed) allowlist guard.
            if resp.status_code == 422:
                detail = resp.json().get("detail", {})
                assert detail != {} and detail.get("error") != "model not in allowlist"


def test_demo_fixture_models_match_backend():
    """AC7 — the offline demo config fixture lists the same model ids as the
    backend allowlist, so the GitHub Pages build matches the live backend."""
    fixture = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "demo"
        / "fixtures"
        / "_config.json"
    )
    data = json.loads(fixture.read_text())
    assert {m["id"] for m in data["models"]} == model_ids()
    assert data["default_model"] == "gpt-4.1-mini"
