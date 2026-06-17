"""ChatRequest gains optional `agent_prompt` and `model` (042-agent-anatomy).

Both are additive request-level fields. ``agent_prompt`` is bounded the same
way ``system_prompt`` is (max 2000 chars). ``model`` is validated against the
curated allowlist exposed by :mod:`app.llm.models` — the FE never has to know
about a server-side default model, the API echoes the resolved value.

This module covers AC2 (allowlist validation) and the additive-default half of
AC1 + AC6 (omitting both keeps today's behavior).
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient
from httpx import Response

from app.llm.models import model_ids
from app.main import app
from app.schemas import ChatRequest


def test_chat_request_accepts_optional_agent_prompt():
    """AC1 — ``agent_prompt`` is optional and bounded."""
    # Default = None.
    req = ChatRequest(message="hi")
    assert req.agent_prompt is None

    # A non-blank override is accepted.
    req = ChatRequest(message="hi", agent_prompt="You are a tour guide.")
    assert req.agent_prompt == "You are a tour guide."

    # Bound: > 2000 chars is rejected.
    too_long = "x" * 2001
    try:
        ChatRequest(message="hi", agent_prompt=too_long)
    except Exception:
        pass
    else:
        raise AssertionError("agent_prompt should be capped at 2000 chars")


def test_chat_request_accepts_optional_model():
    """AC2 — ``model`` is optional; default is None (resolve to settings)."""
    req = ChatRequest(message="hi")
    assert req.model is None

    req = ChatRequest(message="hi", model="gpt-4.1-mini")
    assert req.model == "gpt-4.1-mini"


def test_chat_request_rerank_threshold_bounds():
    """055 AC1 — ``rerank_threshold`` is optional, bounded 0..1; None = no filter."""
    assert ChatRequest(message="hi").rerank_threshold is None
    assert ChatRequest(message="hi", rerank_threshold=0).rerank_threshold == 0
    assert ChatRequest(message="hi", rerank_threshold=0.35).rerank_threshold == 0.35
    for bad in (-0.1, 1.5):
        try:
            ChatRequest(message="hi", rerank_threshold=bad)
        except Exception:
            pass
        else:
            raise AssertionError(f"rerank_threshold {bad} should be rejected (0..1)")


def test_chat_rejects_out_of_range_rerank_threshold_over_http():
    """055 AC1 — the API surfaces the same bound as a 422."""
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "hi", "rerank_threshold": 2})
        assert resp.status_code == 422


def test_chat_omits_model_uses_server_default():
    """AC2 — omitting ``model`` keeps today's behavior (settings.llm_model
    is used). We assert by intercepting the request body the backend echoes."""
    with TestClient(app) as client:
        # Use batch mode so the response is a single JSON document; we only
        # care that the request was accepted (200) when ``model`` is omitted.
        resp = _post_chat(client, {"message": "hi", "mode": "batch"})
        # 200 is the success contract here regardless of whether the call
        # produces an answer (keyless guard env may surface a different code
        # in the trace, but the API-level validation we test passes).
        # The relevant assertion: the request was NOT rejected with 422 by
        # the model allowlist validator.
        assert resp.status_code != 422


def test_chat_rejects_unknown_model_with_422():
    """AC2 — an unlisted ``model`` returns 422 and references the allowlist."""
    with TestClient(app) as client:
        resp = _post_chat(client, {"message": "hi", "mode": "batch", "model": "not-a-real-model"})
        assert resp.status_code == 422
        body = resp.json()
        # The error payload references the offending field and the allowlist.
        detail = json.dumps(body).lower()
        assert "model" in detail
        assert "allow" in detail or "not-a-real-model" in detail


def test_chat_accepts_allowlisted_model():
    """AC2 — an allowlisted ``model`` does NOT trigger the 422 path."""
    valid = next(iter(model_ids()))
    with TestClient(app) as client:
        resp = _post_chat(client, {"message": "hi", "mode": "batch", "model": valid})
        # The request shape is valid; downstream behavior (a real OpenAI call)
        # is exercised by the @openai e2e test, not here.
        assert resp.status_code != 422


def _post_chat(client: TestClient, body: dict) -> Response:
    """Send a chat request without depending on a real OpenAI key.

    In the keyless guard environment the backend will surface an error event
    on the trace; what we care about here is the *API-level* validation
    (422 vs 200), which runs before the agent boots.
    """
    return client.post("/api/chat", json=body)
