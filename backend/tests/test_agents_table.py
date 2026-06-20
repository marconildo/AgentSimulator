"""043-persisted-agent — the `agents` table, the default-agent seed, and the
clear/reseed lifecycle.

The agent moves from an in-memory FE store to a SQLite row. This module pins
the schema shape and the seed semantics; the endpoints + chat wiring live in
sibling modules.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.db.seed import seed_default_agent
from app.db.store import get_store
from app.main import app


def _table_columns(table: str) -> set[str]:
    store = get_store()
    with sqlite3.connect(store.path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r["name"] for r in rows}


def test_agents_table_has_documented_columns():
    """AC1 — the `agents` table exists with every documented column."""
    cols = _table_columns("agents")
    expected = {
        "id",
        "name",
        "description",
        "system_prompt",
        "agent_prompt",
        "model",
        "enabled_tools",
        "is_default",
        "created_at",
        "updated_at",
    }
    assert expected <= cols, f"missing columns: {expected - cols}"


def test_sessions_table_drops_agent_name_column():
    """AC12 — `sessions.agent_name` (added by 042) is dropped after migration."""
    cols = _table_columns("sessions")
    assert "agent_name" not in cols
    assert "agent_id" in cols


@pytest.mark.asyncio
async def test_seed_default_agent_is_idempotent():
    """AC3 — running the seed twice yields exactly one default row.

    We don't assert the row's *name* here: in 044's shared-catalog model the
    default is editable by the user (or earlier tests), so its name is
    whatever the most recent edit left. The idempotency contract is about
    row count, not content.
    """
    await seed_default_agent()
    await seed_default_agent()
    store = get_store()
    with sqlite3.connect(store.path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT name FROM agents WHERE is_default = 1").fetchall()
    assert len(rows) == 1
    assert rows[0]["name"]  # has *some* name


def test_clear_data_reports_agents_and_reseeds():
    """AC11 — `/api/data/clear` includes `agents_deleted` and re-seeds the
    default afterwards so future `create_session` calls keep working."""
    with TestClient(app) as client:
        # Create a session to ensure at least one non-default agent exists.
        client.post("/api/sessions")
        # Clear.
        result = client.post("/api/data/clear").json()
        assert "agents_deleted" in result
        assert isinstance(result["agents_deleted"], int)
        # The default agent must be back after the clear (re-seeded by lifespan
        # / the clear handler itself; either path is fine for this assertion).
        store = get_store()
        with sqlite3.connect(store.path) as conn:
            conn.row_factory = sqlite3.Row
            n_default = conn.execute(
                "SELECT COUNT(*) AS n FROM agents WHERE is_default = 1"
            ).fetchone()["n"]
        assert n_default == 1


@pytest.mark.asyncio
async def test_enabled_tools_distinguishes_all_from_none():
    """Regression — an agent must be able to persist BOTH 'all tools' (``None``,
    unset) and 'no tools' (``[]``, explicit) as *distinct* stored values.

    Bug: ``[]`` was overloaded to mean 'all', so a user who unchecked every tool
    in the dialog was silently run with all tools back. Semantics:
    ``None`` = all (unset) · ``[]`` = none (explicit) · ``[...]`` = exactly those.
    """
    store = get_store()
    agent = await store.create_agent(name="ToolSemantics")
    aid = agent["id"]

    # Explicit "no tools" must round-trip as an empty list, not None.
    updated = await store.update_agent(aid, {"enabled_tools": []})
    assert updated["enabled_tools"] == []
    assert (await store.get_agent(aid))["enabled_tools"] == []

    # Explicit "all tools" (unset) must round-trip as None, not [].
    updated = await store.update_agent(aid, {"enabled_tools": None})
    assert updated["enabled_tools"] is None
    assert (await store.get_agent(aid))["enabled_tools"] is None

    # A concrete subset is preserved verbatim.
    updated = await store.update_agent(aid, {"enabled_tools": ["calculator"]})
    assert updated["enabled_tools"] == ["calculator"]
    assert (await store.get_agent(aid))["enabled_tools"] == ["calculator"]


def test_default_agent_has_required_fields():
    """AC3 — the default row always exists with non-empty required fields.

    044-shared-agent-catalog: prior tests may have edited the default's
    contents (it's shared / editable), so we don't pin specific values —
    only the structural invariants that a freshly-cloned conversation
    relies on (non-empty prompts + a configured model).
    """
    store = get_store()
    with sqlite3.connect(store.path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
    assert row is not None
    assert row["name"]
    assert row["system_prompt"]
    assert row["agent_prompt"]
    assert row["model"]
