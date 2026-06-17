"""061-scenario-builder: the per-feature request inputs that replaced the 008 scenario.

The coarse ``scenario`` enum is gone from ``ChatRequest``; behaviour is now driven by
explicit per-feature inputs (``rerank``, ``runtime``, plus the existing ``ragless``).
Maturity is a client-side derived label, not a request field. The keyless tests cover
schema defaults/validation and the config payload; the openai-marked test checks a
default run is structurally the today-pipeline (backward compat, AC1).
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ChatRequest, Runtime


def test_chat_request_has_no_scenario_field():
    # The maturity ladder is retired as a request input.
    assert "scenario" not in ChatRequest.model_fields


def test_builder_inputs_default_to_todays_simple_run():
    # AC1 — omitting the builder inputs reproduces today's Simple behavior.
    req = ChatRequest(message="hi")
    assert req.rerank is False
    assert req.runtime == Runtime.REACT
    assert req.ragless is False


def test_chat_request_accepts_each_runtime():
    # AC4 — the three runtimes are valid inputs.
    for value in ("react", "deepagents", "multiagent"):
        assert ChatRequest(message="hi", runtime=value).runtime == value


def test_chat_request_rejects_unknown_runtime():
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", runtime="hal9000")


def test_chat_rejects_unknown_runtime_over_http():
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "hi", "runtime": "hal9000"})
        assert resp.status_code == 422


def test_config_still_exposes_scenarios_ladder_as_metadata():
    # The ladder names/blurbs survive in /api/config as descriptive metadata for the
    # builder's *derived* maturity badge (no longer a selectable request input).
    with TestClient(app) as client:
        resp = client.get("/api/config")
        assert resp.status_code == 200
        scenarios = resp.json()["scenarios"]
        by_id = {s["id"]: s for s in scenarios}
        assert {"simple", "intermediate", "advanced"} == set(by_id)
        for s in scenarios:
            assert s["name"]["en"] and s["name"]["pt"]
            assert s["blurb"]["en"] and s["blurb"]["pt"]
            assert isinstance(s["available"], bool)


@pytest.mark.openai
def test_default_run_is_structurally_the_today_pipeline():
    # AC1 — a default run (no builder inputs) fires the whole pipeline, echoes the
    # resolved runtime (react), and reranks nothing.
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is RAG?", "mode": "batch"})
        assert resp.status_code == 200
        body = resp.json()
        stages = {e["stage"] for e in body["events"]}
        assert {"agent.route", "rag.retrieve", "llm.generate", "respond"} <= stages
        assert "rag.rerank" not in stages
        fe = next(e for e in body["events"] if e["stage"] == "frontend")
        request_echo = fe["data"]["request"]
        assert request_echo["runtime"] == "react"
        # A default body stays minimal — the opt-in flags are echoed only when on.
        assert "rerank" not in request_echo
        assert "ragless" not in request_echo
