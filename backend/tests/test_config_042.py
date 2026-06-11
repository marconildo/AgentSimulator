"""``/api/config`` advertises everything the Agent Anatomy dialog prefills with
(042-agent-anatomy): the two prompt-layer defaults, the curated model list, and
the resolved server default model.

These additions are purely additive — every key the prior config endpoint
exposed (``default_system_prompt`` included, with its content swapped to the
new GUARDRAILS layer) stays present and non-empty.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.llm.models import CURATED_MODELS, model_ids
from app.main import app


def test_config_advertises_two_prompt_layers():
    """AC4 — both ``default_system_prompt`` (guardrails) and
    ``default_agent_prompt`` (role) ship non-empty distinct strings."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    assert body["default_system_prompt"].strip()
    assert body["default_agent_prompt"].strip()
    assert body["default_system_prompt"] != body["default_agent_prompt"]


def test_config_advertises_curated_models():
    """AC3 — ``models`` is a non-empty list and every row has ``id`` + ``label``."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    assert isinstance(body["models"], list)
    assert len(body["models"]) >= 1
    ids = set()
    for row in body["models"]:
        assert isinstance(row["id"], str) and row["id"]
        assert isinstance(row["label"], str) and row["label"]
        ids.add(row["id"])
    # Mirror the in-process curated list — the endpoint never invents ids.
    assert ids == model_ids()
    assert ids == {m.id for m in CURATED_MODELS}


def test_config_default_model_is_in_models_list():
    """AC3 — ``default_model`` is the configured value and it appears in
    the advertised list (so the FE can pre-select it without hunting)."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    default = body["default_model"]
    assert isinstance(default, str) and default
    assert default in {m["id"] for m in body["models"]}


def test_config_default_rerank_threshold_is_0_05():
    """The reranker score filter ships ON by default at 0.05 — drops near-zero-score
    chunks (e.g. an off-topic greeting) from the grounding context on the Intermediate
    rung. The frontend slider prefills from this value via /api/config."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    assert body["default_rerank_threshold"] == 0.05


def test_config_preserves_existing_keys():
    """Adding 042 keys did not remove existing 006 / 008 / 017 keys."""
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    for key in (
        "default_system_prompt",
        "default_top_k",
        "top_k_min",
        "top_k_max",
        "tools",
        "scenarios",
        "failure_modes",
    ):
        assert key in body, f"missing legacy config key: {key}"
