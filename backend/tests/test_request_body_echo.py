"""The backend echoes the **resolved** request body onto the trace's
``frontend`` END event so the inspector can show what actually ran
(007-numeric-transparency). 042-agent-anatomy adds ``model`` (always present,
resolved) + ``agent_prompt`` (echoed only when overridden, like ``system_prompt``).

This test pins the echo behavior at the API layer, without depending on a real
OpenAI call: we send a chat request, parse the SSE trace events, and inspect
the ``frontend`` END's ``request`` dict.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def _frontend_request(client: TestClient, body: dict) -> dict[str, Any]:
    """Stream a chat request and return the resolved ``request`` echo dict.

    The ``frontend`` END is the first event emitted, *before* the agent boots
    or talks to OpenAI, so this works in the keyless guard environment too.
    """
    with client.stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200, resp.text
        current = None
        for line in resp.iter_lines():
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and current == "trace":
                payload = json.loads(line.split(":", 1)[1].strip())
                if payload.get("stage") == "frontend" and payload.get("phase") == "end":
                    return payload["data"]["request"]
        raise AssertionError("no frontend END event in the trace")


def test_request_body_always_carries_resolved_model():
    """AC6 — with no ``model`` override the echo carries the configured
    default (``settings.llm_model``)."""
    settings = get_settings()
    with TestClient(app) as client:
        echoed = _frontend_request(client, {"message": "hi", "mode": "stream"})
    assert echoed.get("model") == settings.llm_model


def test_request_body_carries_overridden_model():
    """AC6 — an allowlisted ``model`` override is echoed verbatim."""
    with TestClient(app) as client:
        echoed = _frontend_request(
            client,
            {"message": "hi", "mode": "stream", "model": "gpt-4.1"},
        )
    assert echoed.get("model") == "gpt-4.1"


def test_request_body_echoes_agent_prompt_only_when_set():
    """AC1 — ``agent_prompt`` is echoed only when the client sent it
    (mirrors how ``system_prompt`` already behaves)."""
    with TestClient(app) as client:
        # Omitted: echo does NOT carry the key.
        echoed = _frontend_request(client, {"message": "hi", "mode": "stream"})
    assert "agent_prompt" not in echoed

    with TestClient(app) as client:
        # Provided: echo carries the verbatim value.
        echoed = _frontend_request(
            client,
            {"message": "hi", "mode": "stream", "agent_prompt": "You are X."},
        )
    assert echoed.get("agent_prompt") == "You are X."
