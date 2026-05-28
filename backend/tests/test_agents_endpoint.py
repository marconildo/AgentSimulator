"""044-shared-agent-catalog — sessions link to a SHARED agent; the catalog
endpoints (list/create/delete) drive the dialog header strip; editing one
session's agent propagates to every other session pointing at it.

These tests don't need a real OpenAI key — the plumbing is what we assert.
"""

from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from app.db.store import get_store
from app.main import app


def test_create_session_links_to_default_agent_without_cloning():
    """AC2 — POST returns a session linked to the default agent; no clone."""
    store = get_store()
    with sqlite3.connect(store.path) as conn:
        conn.row_factory = sqlite3.Row
        before = conn.execute("SELECT COUNT(*) AS n FROM agents").fetchone()["n"]
    with TestClient(app) as client:
        body = client.post("/api/sessions").json()
    with sqlite3.connect(store.path) as conn:
        conn.row_factory = sqlite3.Row
        after = conn.execute("SELECT COUNT(*) AS n FROM agents").fetchone()["n"]
        default = conn.execute("SELECT id FROM agents WHERE is_default = 1").fetchone()
    assert after == before  # no new row
    assert body["agent"]["id"] == default["id"]
    assert body["agent"]["is_default"] is True


def test_list_and_get_sessions_include_agent_inline():
    """AC5 from 043 still holds: sessions surface the (shared) agent inline."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        listing = client.get("/api/sessions").json()
    row = next(s for s in listing if s["id"] == created["id"])
    assert row["agent"] is not None
    assert row["agent"]["id"] == created["agent"]["id"]


def test_patch_agent_updates_fields_and_returns_row():
    """AC8 — editing the agent (any field) returns the updated row."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        aid = created["agent"]["id"]
        resp = client.patch(
            f"/api/agents/{aid}",
            json={"name": "Hotel Analyst", "agent_prompt": "You are a hotel analyst."},
        )
    assert resp.status_code == 200
    row = resp.json()
    assert row["name"] == "Hotel Analyst"
    assert row["agent_prompt"] == "You are a hotel analyst."


def test_patch_agent_rejects_over_cap_name():
    """AC6 (043) — name > 60 chars ⇒ 422."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        resp = client.patch(f"/api/agents/{created['agent']['id']}", json={"name": "x" * 61})
    assert resp.status_code == 422


def test_patch_agent_rejects_unknown_model_with_422():
    """AC6 (043) — model not in the curated allowlist ⇒ 422."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        resp = client.patch(
            f"/api/agents/{created['agent']['id']}",
            json={"model": "not-a-real-model"},
        )
    assert resp.status_code == 422


def test_patch_agent_unknown_id_is_404():
    """AC6 (043) — unknown agent id ⇒ 404."""
    with TestClient(app) as client:
        resp = client.patch("/api/agents/does-not-exist", json={"name": "X"})
    assert resp.status_code == 404


def test_edits_propagate_across_sessions_sharing_the_agent():
    """AC8 — both sessions point to the default; PATCHing the agent updates
    every session's inline agent shape on the next list."""
    with TestClient(app) as client:
        a = client.post("/api/sessions").json()
        b = client.post("/api/sessions").json()
        assert a["agent"]["id"] == b["agent"]["id"]  # shared
        client.patch(f"/api/agents/{a['agent']['id']}", json={"agent_prompt": "Shared role."})
        listing = client.get("/api/sessions").json()
        a_now = next(s for s in listing if s["id"] == a["id"])["agent"]
        b_now = next(s for s in listing if s["id"] == b["id"])["agent"]
    assert a_now["agent_prompt"] == "Shared role."
    assert b_now["agent_prompt"] == "Shared role."  # propagates


def test_delete_session_does_not_touch_the_agent():
    """AC3 — deleting a conversation leaves the shared agent intact (the
    `agents` row count is unchanged)."""
    store = get_store()
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        with sqlite3.connect(store.path) as conn:
            conn.row_factory = sqlite3.Row
            before = conn.execute("SELECT COUNT(*) AS n FROM agents").fetchone()["n"]
        client.delete(f"/api/sessions/{created['id']}")
        with sqlite3.connect(store.path) as conn:
            conn.row_factory = sqlite3.Row
            after = conn.execute("SELECT COUNT(*) AS n FROM agents").fetchone()["n"]
    assert after == before


# --- catalog endpoints (044) -----------------------------------------------


def test_list_agents_returns_catalog_default_first():
    """AC4 — GET /api/agents lists every agent; the default is first."""
    with TestClient(app) as client:
        # Create one extra agent so we can verify the ordering.
        client.post("/api/agents", json={"name": "Hotel"})
        rows = client.get("/api/agents").json()
    assert len(rows) >= 2
    assert rows[0]["is_default"] is True


def test_create_agent_clones_default_by_default():
    """AC5 — POST /api/agents without `clone_from` clones the default."""
    with TestClient(app) as client:
        rows_before = client.get("/api/agents").json()
        created = client.post("/api/agents", json={"name": "Lisbon Guide"}).json()
        rows_after = client.get("/api/agents").json()
    assert created["is_default"] is False
    assert created["name"] == "Lisbon Guide"
    # Cloned prompts + model from default.
    default = next(r for r in rows_before if r["is_default"])
    assert created["system_prompt"] == default["system_prompt"]
    assert created["agent_prompt"] == default["agent_prompt"]
    assert created["model"] == default["model"]
    assert len(rows_after) == len(rows_before) + 1


def test_create_agent_with_clone_from_uses_that_source():
    """AC5 — `clone_from` overrides the default as the source row."""
    with TestClient(app) as client:
        a = client.post("/api/agents", json={"name": "A", "description": "first"}).json()
        # PATCH A so it differs from the default's prompts.
        client.patch(f"/api/agents/{a['id']}", json={"agent_prompt": "I am A."})
        b = client.post("/api/agents", json={"name": "B", "clone_from": a["id"]}).json()
    assert b["agent_prompt"] == "I am A."


def test_create_agent_default_name_suffix():
    """AC5 — omitting `name` gives '<source> (cópia)'."""
    with TestClient(app) as client:
        # Default's name carries through if no name + no clone_from.
        rows = client.get("/api/agents").json()
        default = next(r for r in rows if r["is_default"])
        created = client.post("/api/agents", json={}).json()
    assert created["name"] == f"{default['name']} (cópia)"


def test_delete_agent_repoints_sessions_to_default():
    """AC6 — DELETE non-default agent moves its sessions onto the default."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        default_id = created["agent"]["id"]
        # Create + switch the session to a new agent.
        a = client.post("/api/agents", json={"name": "A"}).json()
        client.patch(f"/api/sessions/{sid}", json={"agent_id": a["id"]})
        # Now delete A. The session should be back on the default.
        resp = client.delete(f"/api/agents/{a['id']}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["sessions_repointed"] == 1
        session_now = next(s for s in client.get("/api/sessions").json() if s["id"] == sid)
    assert session_now["agent"]["id"] == default_id


def test_delete_default_agent_is_409():
    """AC6 — deleting the default is forbidden (409)."""
    with TestClient(app) as client:
        rows = client.get("/api/agents").json()
        default = next(r for r in rows if r["is_default"])
        resp = client.delete(f"/api/agents/{default['id']}")
    assert resp.status_code == 409


def test_delete_unknown_agent_is_404():
    with TestClient(app) as client:
        resp = client.delete("/api/agents/does-not-exist")
    assert resp.status_code == 404


def test_patch_session_switches_agent():
    """AC7 — PATCH /api/sessions/{id} with `agent_id` swaps the link."""
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        sid = created["id"]
        original_id = created["agent"]["id"]
        a = client.post("/api/agents", json={"name": "Switcher"}).json()
        resp = client.patch(f"/api/sessions/{sid}", json={"agent_id": a["id"]})
    assert resp.status_code == 200
    row = resp.json()
    assert row["agent"]["id"] == a["id"]
    assert row["agent"]["id"] != original_id


def test_patch_session_with_unknown_agent_id_is_422():
    with TestClient(app) as client:
        created = client.post("/api/sessions").json()
        resp = client.patch(
            f"/api/sessions/{created['id']}",
            json={"agent_id": "does-not-exist"},
        )
    assert resp.status_code == 422


def test_patch_session_unknown_session_is_404():
    with TestClient(app) as client:
        # Need a real agent_id for validation order: unknown agent yields 422
        # before the session lookup, so test session-404 with a valid agent.
        valid = client.get("/api/agents").json()[0]["id"]
        resp = client.patch("/api/sessions/does-not-exist", json={"agent_id": valid})
    assert resp.status_code == 404
