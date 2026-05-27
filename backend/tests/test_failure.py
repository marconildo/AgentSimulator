"""017-failure-injection: the opt-in failure simulator.

`simulate_failure` is a request-only input (like the 006 overrides / 008
scenario) — *not* a TraceEvent field. Omitting it (or `none`) reproduces today's
run byte-for-byte (AC1). Two deterministic injection points surface a simulated
error on the existing END-event `data` (an `error` key, `simulated: true`) so the
learner can watch the agent degrade — no new Stage/Phase, no schema type change.

Keyless guard tests pin the schema/seam (AC1); the `@pytest.mark.openai` tests
run a real agent and assert structurally (tool_error → degrade, llm_timeout →
clean degraded state) to tolerate model variability.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ChatRequest, SimulateFailure

# --- AC4: /api/config advertises the allowed values --------------------------


def test_config_advertises_failure_modes():
    # AC4 — the frontend selector prefills from here; the values match the enum so
    # nothing is hardcoded client-side. Inspectable without a key, like the rest.
    with TestClient(app) as client:
        resp = client.get("/api/config")
        assert resp.status_code == 200
        modes = resp.json()["failure_modes"]
        assert modes == [m.value for m in SimulateFailure]
        assert modes[0] == "none"  # default first


# --- AC1: the no-failure invariant (lock it first) --------------------------


def test_chat_request_simulate_failure_defaults_to_none():
    # AC1 — omitting the field reproduces today's behavior (no failure).
    req = ChatRequest(message="hi")
    assert req.simulate_failure == SimulateFailure.NONE


def test_chat_request_accepts_each_failure_mode():
    # AC1 — the bounded enum's values are all valid inputs.
    for value in ("none", "tool_error", "llm_timeout"):
        assert ChatRequest(message="hi", simulate_failure=value).simulate_failure == value


def test_chat_request_rejects_unknown_failure_mode():
    # AC1 — an out-of-enum value is a validation error (422 over HTTP).
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", simulate_failure="explode")


def test_chat_rejects_unknown_failure_over_http():
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "hi", "simulate_failure": "explode"})
        assert resp.status_code == 422


@pytest.mark.openai
def test_run_without_failure_has_no_simulated_error_on_any_event():
    # AC1 — backward compat: omitting `simulate_failure` runs the today-pipeline
    # and NO event `data` carries an injected error/simulated marker.
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is 2 + 2?", "mode": "batch"})
        assert resp.status_code == 200
        events = resp.json()["events"]
        assert all(not e["data"].get("simulated") for e in events)
        assert all("error" not in e["data"] for e in events if e["stage"] != "backend")


@pytest.mark.openai
def test_explicit_none_is_identical_to_omitting():
    # AC1 — `simulate_failure="none"` is the same unchanged run. A corpus-detail
    # question makes the agent retrieve (026: retrieval is now a tool decision, so
    # rag.retrieve fires only when the agent calls search_knowledge_base).
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={
                "message": "Why does chunk size matter in a RAG pipeline, and what is top-k?",
                "mode": "batch",
                "simulate_failure": "none",
            },
        )
        body = resp.json()
        stages = {e["stage"] for e in body["events"]}
        assert {"agent.route", "rag.retrieve", "llm.generate", "respond"} <= stages
        assert all(not e["data"].get("simulated") for e in body["events"])
        assert body["answer"].strip()


# --- AC2: tool_error → the agent sees a failed tool and degrades ------------


@pytest.mark.openai
def test_tool_error_surfaces_on_mcp_call_and_run_completes():
    # AC2 — a tool-triggering prompt + tool_error: the mcp.call END carries a
    # simulated error, the run reaches a terminal state (no 500), and an answer
    # (degraded / abstained) is still produced — the agent reacted to the failure.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={
                "message": "What is 2 + 2?",
                "mode": "batch",
                "simulate_failure": "tool_error",
            },
        )
        assert resp.status_code == 200  # no 500/crash
        body = resp.json()
        calls = [e for e in body["events"] if e["stage"] == "mcp.call" and e["phase"] == "end"]
        assert calls, "expected a tool call to inject the error into"
        assert any(c["data"].get("simulated") is True for c in calls)
        assert any(c["data"].get("error") for c in calls)
        # The run reached its terminal state and the agent still answered.
        assert {"respond", "llm.generate"} <= {e["stage"] for e in body["events"]}
        assert body["answer"].strip()


@pytest.mark.openai
def test_tool_error_feeds_the_error_back_to_the_model():
    # AC2 — the simulated error is the *observation* fed back to the model (so it
    # can reason over the failure), not silently swallowed: the failed tool's
    # result is the injected error text.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={
                "message": "What is 2 + 2?",
                "mode": "batch",
                "simulate_failure": "tool_error",
            },
        )
        calls = [
            e for e in resp.json()["events"] if e["stage"] == "mcp.call" and e["phase"] == "end"
        ]
        assert calls
        assert all(str(c["data"]["result"]).startswith("error:") for c in calls)


# --- AC3: llm_timeout → a clean degraded state (no hang, no 500) ------------


@pytest.mark.openai
def test_llm_timeout_surfaces_on_llm_stage_and_ends_cleanly():
    # AC3 — a model call surfaces a simulated timeout the UI can show, and the run
    # ends in a clean degraded state: no hang, no unhandled 500, a degraded answer.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={"message": "What is RAG?", "mode": "batch", "simulate_failure": "llm_timeout"},
        )
        assert resp.status_code == 200  # no 500/crash
        body = resp.json()
        events = body["events"]
        # The timeout is recorded on an LLM-station END event (llm.prompt span).
        llm_errs = [
            e
            for e in events
            if e["stage"] == "llm.prompt" and e["phase"] == "end" and e["data"].get("simulated")
        ]
        assert llm_errs, "expected a simulated timeout on the llm.prompt END"
        assert llm_errs[0]["data"].get("error")
        # Clean terminal state: respond fired and a degraded answer is set; the
        # model was never really generated (the run short-circuits to respond).
        assert any(e["stage"] == "respond" and e["phase"] == "end" for e in events)
        assert body["answer"].strip()
        assert not [e for e in events if e["stage"] == "llm.generate"]
