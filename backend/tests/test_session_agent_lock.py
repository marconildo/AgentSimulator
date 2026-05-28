"""045-composer-agent-selector — server-side agent lock.

The conversation's agent is locked the moment a turn is persisted
(`message_count > 0`). After that, ``PATCH /api/sessions/{id}`` with a
different ``agent_id`` returns ``409 Conflict`` with a structured body
``{detail: "agent_locked", message_count: <n>}``. Editing the linked
agent itself (its name, prompts, model, tools) is unaffected — only the
session-agent **link** is frozen.

Belt-and-braces against a stale UI tab. The FE composer chip + the 044
dialog selector also disable themselves on `message_count > 0`, but the
backend doesn't trust the client to enforce it.

These tests are pure HTTP-level (TestClient) — no real OpenAI key
required.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_session_meta_exposes_message_count():
    """AC4 — both the list and the single-session endpoint surface
    `message_count` so the FE derives the lock without an extra query."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        # Freshly created session = 0 messages.
        assert created.get("message_count") == 0
        # Listing should also carry it.
        listing = client.get("/api/sessions").json()
        row = next(s for s in listing if s["id"] == sid)
        assert row["message_count"] == 0
        # Single-session GET should also surface it.
        single = client.get(f"/api/sessions/{sid}").json()
        assert single["message_count"] == 0


def test_patch_session_agent_succeeds_when_empty():
    """AC1 happy path — an unstarted session can switch agents freely."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        other = client.post("/api/agents", json={"name": "Empty-Tab Agent"}).json()
        resp = client.patch(f"/api/sessions/{sid}", json={"agent_id": other["id"]})
    assert resp.status_code == 200
    assert resp.json()["agent"]["id"] == other["id"]


def _send_one_turn(client: TestClient, sid: str) -> None:
    """Persist a single user/assistant turn directly via the store so we
    don't need a real OpenAI key here. The store API is part of the
    public surface (used by other keyless tests like `test_clear`).

    Each call uses a fresh uuid for the message id — the 047 invariant
    is that turn ids are immutable, so we never reuse one even across
    tests sharing the same throwaway DB.
    """
    import asyncio
    import uuid

    from app.db.store import get_store

    asyncio.run(get_store().write_message(sid, uuid.uuid4().hex, "hello", "hi back"))


def test_patch_session_agent_returns_409_when_started():
    """AC1 — once a turn lands, swapping agents on the session is 409."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        original = created["agent"]["id"]
        other = client.post("/api/agents", json={"name": "Locked-Out"}).json()

        _send_one_turn(client, sid)

        resp = client.patch(f"/api/sessions/{sid}", json={"agent_id": other["id"]})
    assert resp.status_code == 409
    body = resp.json()
    # FastAPI wraps {detail: …} bodies; the structured value is the detail.
    assert body["detail"] == {"detail": "agent_locked", "message_count": 1}

    # The session still points at the original agent.
    with TestClient(app) as client:
        row = client.get(f"/api/sessions/{sid}").json()
    assert row["agent"]["id"] == original


def test_patch_session_with_same_agent_id_is_noop_when_started():
    """AC1 corollary — PATCHing the same agent_id the session already
    has is not a "change", so it should succeed (200) and not 409. This
    keeps the FE simple: it can dispatch unconditionally on selection.
    """
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        original = created["agent"]["id"]
        _send_one_turn(client, sid)
        resp = client.patch(f"/api/sessions/{sid}", json={"agent_id": original})
    assert resp.status_code == 200
    assert resp.json()["agent"]["id"] == original


def test_patch_agent_unaffected_by_session_message_count():
    """AC3 — editing the linked agent itself stays free. The lock is on
    the **session-agent link**, not the agent's contents."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        aid = created["agent"]["id"]
        _send_one_turn(client, sid)

        resp = client.patch(
            f"/api/agents/{aid}",
            json={"agent_prompt": "You are now a poetry tutor."},
        )
        assert resp.status_code == 200
        # The session's inlined agent reflects the new prompt (shared catalog).
        row = client.get(f"/api/sessions/{sid}").json()
        assert row["agent"]["agent_prompt"] == "You are now a poetry tutor."
