"""043-persisted-agent — sessions clone the default + GET sessions include the
agent inline + PATCH /api/agents/{id} + per-conversation isolation.

These tests don't need a real OpenAI key — the agent's *content* is the seed
default, the *plumbing* is what we assert.
"""

from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from app.db.store import get_store
from app.main import app


def test_create_session_clones_default_into_inline_agent():
    """AC4 + AC5 — POST returns a session with the cloned agent inline,
    and that agent is distinct from the default (its `is_default` is False)."""
    with TestClient(app) as client:
        body = client.post("/api/sessions").json()
    assert "agent" in body
    agent = body["agent"]
    assert agent is not None
    assert agent["is_default"] is False
    assert agent["name"]  # carried from the default
    assert agent["system_prompt"]  # carried from the default
    assert agent["model"]  # carried from the default
    # The cloned id is fresh, not the default's id.
    store = get_store()
    with sqlite3.connect(store.path) as conn:
        conn.row_factory = sqlite3.Row
        default = conn.execute("SELECT id FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
    assert agent["id"] != default["id"]


def test_list_and_get_sessions_include_agent_inline():
    """AC5 — both `GET /api/sessions` and `GET /api/sessions/{id}` (via the
    messages endpoint, since there's no direct single-session GET today)
    surface the agent inline. We assert through the list endpoint plus the
    POST response (which is itself a single-session shape)."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        listing = client.get("/api/sessions").json()
    assert isinstance(listing, list) and listing
    row = next(s for s in listing if s["id"] == created["id"])
    assert row["agent"] is not None
    assert row["agent"]["id"] == created["agent"]["id"]


def test_patch_agent_updates_fields_and_returns_row():
    """AC6 — PATCH /api/agents/{id} accepts partial bodies and returns the
    updated row."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        aid = created["agent"]["id"]
        resp = client.patch(
            f"/api/agents/{aid}",
            json={
                "name": "Hotel Analyst",
                "description": "Specialist in hotel KPIs.",
                "agent_prompt": "You are a hotel data analyst.",
            },
        )
    assert resp.status_code == 200
    row = resp.json()
    assert row["name"] == "Hotel Analyst"
    assert row["description"] == "Specialist in hotel KPIs."
    assert row["agent_prompt"] == "You are a hotel data analyst."
    # Untouched fields keep their previous value.
    assert row["system_prompt"]


def test_patch_agent_rejects_over_cap_name():
    """AC6 — name > 60 chars ⇒ 422."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        aid = created["agent"]["id"]
        resp = client.patch(f"/api/agents/{aid}", json={"name": "x" * 61})
    assert resp.status_code == 422


def test_patch_agent_rejects_unknown_model_with_422():
    """AC6 — model not in the curated allowlist ⇒ 422."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        aid = created["agent"]["id"]
        resp = client.patch(f"/api/agents/{aid}", json={"model": "not-a-real-model"})
    assert resp.status_code == 422


def test_patch_agent_unknown_id_is_404():
    """AC6 — unknown agent id ⇒ 404."""
    with TestClient(app) as client:
        resp = client.patch("/api/agents/does-not-exist", json={"name": "X"})
    assert resp.status_code == 404


def test_edits_in_one_conversation_do_not_affect_another():
    """AC7 — clone-on-create isolation. Edit A's agent; B's agent is unchanged."""
    with TestClient(app) as client:
        a = client.post("/api/sessions").json()
        b = client.post("/api/sessions").json()
        # Sanity: distinct agent ids.
        assert a["agent"]["id"] != b["agent"]["id"]
        # Diff A.
        client.patch(
            f"/api/agents/{a['agent']['id']}",
            json={"agent_prompt": "You are A."},
        )
        # B's prompts must still be the seed defaults.
        listing = client.get("/api/sessions").json()
        b_now = next(s for s in listing if s["id"] == b["id"])["agent"]
        assert b_now["agent_prompt"] != "You are A."


def test_delete_session_cascades_to_cloned_agent_but_keeps_default():
    """AC8 — deleting a session drops its cloned agent row, and the seed
    default agent stays in place (cascade is conditional on `is_default = 0`)."""
    store = get_store()
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        aid = created["agent"]["id"]
        # Sanity: cloned agent exists.
        with sqlite3.connect(store.path) as conn:
            conn.row_factory = sqlite3.Row
            assert conn.execute("SELECT 1 FROM agents WHERE id = ?", (aid,)).fetchone()
        client.delete(f"/api/sessions/{created['id']}")
        with sqlite3.connect(store.path) as conn:
            conn.row_factory = sqlite3.Row
            assert conn.execute("SELECT 1 FROM agents WHERE id = ?", (aid,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM agents WHERE is_default = 1").fetchone() is not None
