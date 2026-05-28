"""043-persisted-agent — `/api/chat` reads the session's agent row when the
request body omits the four override fields. AC9 (agent → run), AC10 (request
override still wins).

Two happy paths, both marked `@pytest.mark.openai`. Structural assertions on
the trace.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.openai


def _stream_llm_prompt_system(client: TestClient, body: dict) -> str:
    """Run the chat request and pull the composed system message out of the
    `llm.prompt` END event. Works in streaming mode (the SSE the FE uses)."""
    with client.stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200, resp.text
        current = None
        for line in resp.iter_lines():
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and current == "trace":
                payload = json.loads(line.split(":", 1)[1].strip())
                if payload.get("stage") == "llm.prompt" and payload.get("phase") == "end":
                    return payload["data"]["system"]
        raise AssertionError("no llm.prompt END in trace")


def test_chat_reads_agent_when_request_omits_overrides():
    """AC9 — PATCH the agent's `agent_prompt`, send a chat with empty
    overrides, assert the trace's composed system contains the new role."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        aid = created["agent"]["id"]
        role = "You are a Lisbon tour guide. Mention pastel de nata when relevant."
        client.patch(f"/api/agents/{aid}", json={"agent_prompt": role})

        system = _stream_llm_prompt_system(
            client,
            {"message": "Hi", "session_id": sid, "mode": "stream"},
        )
    assert role in system, "agent's agent_prompt missing from composed system"


def test_request_override_still_wins_over_agent():
    """AC10 — when the request *does* include `system_prompt`/`agent_prompt`,
    the request value wins for that turn; the agent row is untouched."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        aid = created["agent"]["id"]
        # Set the agent's prompt to one thing…
        client.patch(f"/api/agents/{aid}", json={"agent_prompt": "Agent role A."})
        # …then send a chat that overrides it to something else.
        system = _stream_llm_prompt_system(
            client,
            {
                "message": "Hi",
                "session_id": sid,
                "mode": "stream",
                "agent_prompt": "Request role B.",
            },
        )
        # The override (B) is in the composed system; the agent's value (A) is not.
        assert "Request role B." in system
        assert "Agent role A." not in system
        # The agent row in the DB is unchanged.
        row = client.get(f"/api/agents/{aid}").json()
        assert row["agent_prompt"] == "Agent role A."
