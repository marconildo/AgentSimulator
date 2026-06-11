"""008-scenario-framework: the scenario request seam + /api/config exposure.

`scenario` is a request-only input (like the 006 overrides) — not a TraceEvent
field. The keyless tests cover schema defaults/validation and the config payload;
the openai-marked test checks a real run is structurally unchanged when the
field is omitted (backward compat, AC1).
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ChatRequest, Scenario


def test_chat_request_scenario_defaults_to_simple():
    # AC1 — omitting `scenario` reproduces today's behavior (the simple rung).
    req = ChatRequest(message="hi")
    assert req.scenario == Scenario.SIMPLE


def test_chat_request_accepts_each_scenario():
    # AC1 — the three rungs of the maturity ladder are valid inputs.
    for value in ("simple", "intermediate", "advanced"):
        assert ChatRequest(message="hi", scenario=value).scenario == value


def test_chat_request_rejects_unknown_scenario():
    # AC1 — an out-of-ladder value is a validation error (422 over HTTP).
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", scenario="quantum")


def test_chat_rejects_unknown_scenario_over_http():
    # AC1 — the API surfaces the same validation as a 422.
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "hi", "scenario": "quantum"})
        assert resp.status_code == 422


def test_config_exposes_scenarios_ladder():
    # AC2 — the switcher prefills from here; nothing about the ladder is hardcoded
    # client-side. Inspectable without a key, like the rest of /api/config.
    with TestClient(app) as client:
        resp = client.get("/api/config")
        assert resp.status_code == 200
        scenarios = resp.json()["scenarios"]
        by_id = {s["id"]: s for s in scenarios}
        assert {"simple", "intermediate", "advanced"} == set(by_id)
        for s in scenarios:
            # bilingual name + blurb (constitution §4) and an availability flag.
            assert s["name"]["en"] and s["name"]["pt"]
            assert s["blurb"]["en"] and s["blurb"]["pt"]
            assert isinstance(s["available"], bool)
        # Simple + Intermediate execute (054-rag-block-expansion lit up the
        # reranker, the first real Intermediate node); Advanced is still coming soon.
        assert by_id["simple"]["available"] is True
        assert by_id["intermediate"]["available"] is True
        assert by_id["advanced"]["available"] is False


@pytest.mark.openai
def test_simple_scenario_run_echoes_field_and_keeps_pipeline():
    # AC1 — a run carrying scenario="simple" (the default rung) still fires the
    # whole pipeline and echoes the resolved field on the frontend event.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat", json={"message": "What is RAG?", "mode": "batch", "scenario": "simple"}
        )
        assert resp.status_code == 200
        body = resp.json()
        stages = {e["stage"] for e in body["events"]}
        assert {"agent.route", "rag.retrieve", "llm.generate", "respond"} <= stages
        fe = next(e for e in body["events"] if e["stage"] == "frontend")
        assert fe["data"]["request"]["scenario"] == "simple"


@pytest.mark.openai
def test_run_without_scenario_is_structurally_unchanged():
    # AC1 — backward compat: omitting `scenario` runs exactly the today-pipeline.
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is RAG?", "mode": "batch"})
        body = resp.json()
        stages = {e["stage"] for e in body["events"]}
        assert {"agent.route", "rag.retrieve", "llm.generate", "respond"} <= stages
        fe = next(e for e in body["events"] if e["stage"] == "frontend")
        # The body echoes the resolved scenario (defaulting to simple).
        assert fe["data"]["request"]["scenario"] == "simple"
