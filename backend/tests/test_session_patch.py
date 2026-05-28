"""Per-conversation ``agent_name`` (042-agent-anatomy).

The session row gains an optional ``agent_name`` column (default ``NULL``),
editable via ``PATCH /api/sessions/{id}``. The dialog's Identity section sets
it, and the Agent station header reads it.

This module covers AC10: set / overwrite / clear / over-cap / unknown-id.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _new_session(client: TestClient) -> str:
    resp = client.post("/api/sessions")
    assert resp.status_code == 200
    return resp.json()["id"]


def test_session_includes_agent_name_field():
    """The session row carries the new ``agent_name`` field; fresh ⇒ None."""
    with TestClient(app) as client:
        sid = _new_session(client)
        # The list endpoint reflects the same shape (used by the FE sidebar).
        sessions = client.get("/api/sessions").json()
        target = next(s for s in sessions if s["id"] == sid)
        assert "agent_name" in target
        assert target["agent_name"] is None


def test_patch_session_sets_agent_name():
    """AC10 — PATCH writes the name and returns it on the response."""
    with TestClient(app) as client:
        sid = _new_session(client)
        resp = client.patch(
            f"/api/sessions/{sid}",
            json={"agent_name": "Hotel Analyst"},
        )
        assert resp.status_code == 200
        assert resp.json()["agent_name"] == "Hotel Analyst"

        # Persisted across reads.
        sessions = client.get("/api/sessions").json()
        target = next(s for s in sessions if s["id"] == sid)
        assert target["agent_name"] == "Hotel Analyst"


def test_patch_session_overwrites_existing_name():
    """AC10 — a second PATCH replaces the prior name."""
    with TestClient(app) as client:
        sid = _new_session(client)
        client.patch(f"/api/sessions/{sid}", json={"agent_name": "First"})
        resp = client.patch(f"/api/sessions/{sid}", json={"agent_name": "Second"})
        assert resp.status_code == 200
        assert resp.json()["agent_name"] == "Second"


def test_patch_session_clears_agent_name_with_empty_string():
    """AC10 — an empty / whitespace string clears the override (NULL)."""
    with TestClient(app) as client:
        sid = _new_session(client)
        client.patch(f"/api/sessions/{sid}", json={"agent_name": "X"})
        resp = client.patch(f"/api/sessions/{sid}", json={"agent_name": ""})
        assert resp.status_code == 200
        assert resp.json()["agent_name"] is None


def test_patch_session_rejects_over_cap_with_422():
    """AC10 — names longer than 60 chars are rejected."""
    with TestClient(app) as client:
        sid = _new_session(client)
        resp = client.patch(
            f"/api/sessions/{sid}",
            json={"agent_name": "x" * 61},
        )
        assert resp.status_code == 422


def test_patch_session_unknown_id_is_404():
    """AC10 — patching a session that doesn't exist is a 404."""
    with TestClient(app) as client:
        resp = client.patch(
            "/api/sessions/does-not-exist",
            json={"agent_name": "X"},
        )
        assert resp.status_code == 404
