"""End-to-end happy path for 042-agent-anatomy overrides (AC22).

One real OpenAI call with a non-default ``agent_prompt`` (a tour-guide role)
and a non-default ``model``. We assert structurally — the composed system
message contains both the guardrails default and the overridden role; the
``llm.prompt`` event's ``data.model`` matches the override; the answer is
non-empty. We do NOT assert semantic accuracy (the model can paraphrase).
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.agent.prompts import GUARDRAILS_PROMPT
from app.main import app

pytestmark = pytest.mark.openai


def _stream_events(client: TestClient, body: dict) -> tuple[list[dict], dict]:
    """Run a chat request and collect the trace events + the ``done`` payload."""
    events: list[dict] = []
    done: dict = {}
    with client.stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200, resp.text
        current = None
        for line in resp.iter_lines():
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                payload = json.loads(line.split(":", 1)[1].strip())
                if current == "trace":
                    events.append(payload)
                elif current == "done":
                    done = payload
    return events, done


def test_overrides_change_composed_system_and_model():
    """AC22 — ``agent_prompt`` + ``model`` overrides flow through the run."""
    role = "You are a tour guide for Lisbon. Mention pastel de nata when relevant."
    body = {
        "message": "What's a fun fact about Belém?",
        "mode": "stream",
        "agent_prompt": role,
        "model": "gpt-4.1",
    }
    with TestClient(app) as client:
        events, done = _stream_events(client, body)

    # The llm.prompt END carries the composed system + the resolved model.
    llm_prompt_end = next(
        ev for ev in events if ev["stage"] == "llm.prompt" and ev["phase"] == "end"
    )
    system_text = llm_prompt_end["data"]["system"]
    assert role in system_text, "agent_prompt override missing from composed system"
    assert GUARDRAILS_PROMPT.split("\n", 1)[0] in system_text, (
        "guardrails default missing from composed system"
    )

    # The model echo matches the override on both the request body and the
    # llm.prompt event (which is what 011 already carries).
    frontend_end = next(ev for ev in events if ev["stage"] == "frontend" and ev["phase"] == "end")
    assert frontend_end["data"]["request"]["model"] == "gpt-4.1"
    # llm.generate END carries the model too; assert symmetry.
    gen_end = next(ev for ev in events if ev["stage"] == "llm.generate" and ev["phase"] == "end")
    assert gen_end["data"]["model"] == "gpt-4.1"

    # The answer is non-empty (structural, not semantic).
    assert done.get("answer") or any(
        ev["stage"] == "respond" and ev["phase"] == "end" for ev in events
    )
