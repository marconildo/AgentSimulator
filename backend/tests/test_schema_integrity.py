"""Schema-integrity guards (047-db-integrity-constraints).

Hardens three latent footguns the 046 audit surfaced:

- ``sessions.agent_id`` now has ``ON DELETE SET NULL`` (was no clause).
- ``agents.is_default`` carries ``CHECK (is_default IN (0, 1))``.
- ``documents.chunk_count`` carries ``CHECK (chunk_count >= 0)``.
- ``messages`` writes use plain ``INSERT`` (was ``INSERT OR REPLACE``),
  so a duplicate id raises ``sqlite3.IntegrityError`` instead of silently
  rewriting the row and orphaning ``message_documents``.

Plus a one-shot orphan cleanup on ``message_documents`` during the
``user_version 1 → 2`` migration. The audit + clear-coverage tests
from 046 are expected to stay green after the migration runs (same
table set, same return-shape).

Many tests below need a "pre-047 DB" fixture — a database at
``user_version = 1`` with the OLD DDL (no checks, no SET NULL). The
small ``_make_pre_047_db`` helper at the top of this file writes that
state with raw ``sqlite3.connect`` so opening a real ``ConversationStore``
against the path triggers the migration we want to test.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from time import time
from typing import Any

import pytest

from app.db.store import (
    DEFAULT_AGENT_ID,
    ConversationStore,
)

# Pre-047 DDL — the schema as it stood at `user_version = 1` (post-044,
# pre-047). Matches what an existing dev DB looks like before the
# migration runs. Deliberately a *literal* string rather than importing
# `_SCHEMA` so the test is robust to future edits of the live schema.
_PRE_047_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    title      TEXT,
    agent_id   TEXT REFERENCES agents(id),
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    agent_prompt  TEXT NOT NULL,
    model         TEXT NOT NULL,
    enabled_tools TEXT NOT NULL DEFAULT '[]',
    is_default    INTEGER NOT NULL DEFAULT 0,
    created_at    REAL NOT NULL,
    updated_at    REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_is_default ON agents(is_default);
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    answer     TEXT NOT NULL,
    chunks     TEXT NOT NULL DEFAULT '[]',
    skills     TEXT NOT NULL DEFAULT '[]',
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS message_documents (
    message_id  TEXT NOT NULL REFERENCES messages(id)  ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at  REAL NOT NULL,
    PRIMARY KEY (message_id, document_id)
);
CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_documents_message  ON message_documents(message_id);
CREATE INDEX IF NOT EXISTS idx_message_documents_document ON message_documents(document_id);
"""


def _make_pre_047_db(path: Path, *, seed: dict[str, Any] | None = None) -> None:
    """Write a database at ``user_version = 1`` with the OLD DDL.

    Optional ``seed`` dict mirrors the rows the migration tests want
    pre-populated. The default seeds nothing; callers pass any subset
    of {sessions, agents, messages, documents, message_documents,
    orphan_message_documents}.
    """
    seed = seed or {}
    with sqlite3.connect(path) as conn:
        conn.executescript(_PRE_047_SCHEMA)
        now = time()
        # Always seed the default agent (the live migration assumes it).
        conn.execute(
            "INSERT INTO agents (id, name, description, system_prompt, agent_prompt, "
            "model, enabled_tools, is_default, created_at, updated_at) "
            "VALUES (?, 'Agent Simulator', '', 'g', 'a', 'gpt-4o-mini', '[]', 1, ?, ?)",
            (DEFAULT_AGENT_ID, now, now),
        )
        for agent_id in seed.get("agents", []):
            conn.execute(
                "INSERT INTO agents (id, name, description, system_prompt, agent_prompt, "
                "model, enabled_tools, is_default, created_at, updated_at) "
                "VALUES (?, ?, '', 'g', 'a', 'gpt-4o-mini', '[]', 0, ?, ?)",
                (agent_id, f"agent {agent_id}", now, now),
            )
        for s in seed.get("sessions", []):
            conn.execute(
                "INSERT INTO sessions (id, title, agent_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (s["id"], s.get("title"), s.get("agent_id", DEFAULT_AGENT_ID), now, now),
            )
        for m in seed.get("messages", []):
            conn.execute(
                "INSERT INTO messages (id, session_id, message, answer, "
                "chunks, skills, created_at) VALUES (?, ?, ?, ?, '[]', '[]', ?)",
                (m["id"], m["session_id"], m.get("message", "q"), m.get("answer", "a"), now),
            )
        for d in seed.get("documents", []):
            conn.execute(
                "INSERT INTO documents (id, session_id, filename, chunk_count, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    d["id"],
                    d["session_id"],
                    d.get("filename", "f.pdf"),
                    d.get("chunk_count", 1),
                    now,
                ),
            )
        for j in seed.get("message_documents", []):
            conn.execute(
                "INSERT INTO message_documents (message_id, document_id, created_at) "
                "VALUES (?, ?, ?)",
                (j["message_id"], j["document_id"], now),
            )
        # Pin user_version to 1 (post-044, pre-047) so the migration runs.
        conn.execute("PRAGMA user_version = 1")


# --- CHECK constraints (AC3, AC4) ------------------------------------------


def test_agents_is_default_check_rejects_non_boolean(tmp_path):
    """AC3 — `is_default` must be 0 or 1; any other integer raises."""
    path = tmp_path / "check_default.sqlite3"
    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO agents (id, name, description, system_prompt, agent_prompt, "
                "model, enabled_tools, is_default, created_at, updated_at) "
                "VALUES ('bogus', 'X', '', 'g', 'a', 'gpt-4o-mini', '[]', 2, 0, 0)"
            )
        # 0 and 1 both succeed.
        conn.execute(
            "INSERT INTO agents (id, name, description, system_prompt, agent_prompt, "
            "model, enabled_tools, is_default, created_at, updated_at) "
            "VALUES ('ok-zero', 'X', '', 'g', 'a', 'gpt-4o-mini', '[]', 0, 0, 0)"
        )


def test_documents_chunk_count_check_rejects_negative(tmp_path):
    """AC4 — negative chunk_count rejected; zero allowed (empty doc);
    positive works."""
    path = tmp_path / "check_chunks.sqlite3"
    store = ConversationStore(path)
    # Need a session for the FK.
    import asyncio

    sid = asyncio.run(store.create_session())["id"]
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO documents (id, session_id, filename, chunk_count, created_at) "
                "VALUES ('neg', ?, 'x.pdf', -1, 0)",
                (sid,),
            )
        conn.execute(
            "INSERT INTO documents (id, session_id, filename, chunk_count, created_at) "
            "VALUES ('zero', ?, 'x.pdf', 0, 0)",
            (sid,),
        )
        conn.execute(
            "INSERT INTO documents (id, session_id, filename, chunk_count, created_at) "
            "VALUES ('pos', ?, 'x.pdf', 5, 0)",
            (sid,),
        )


# --- FK ON DELETE SET NULL (AC1, AC2) --------------------------------------


def test_sessions_agent_id_fk_is_set_null(tmp_path):
    """AC1 — the `sessions.agent_id` FK carries `ON DELETE SET NULL`."""
    path = tmp_path / "fk_setnull.sqlite3"
    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        rows = conn.execute("PRAGMA foreign_key_list(sessions)").fetchall()
    fks = {r[3]: r[6] for r in rows}  # from-col → on_delete
    assert fks.get("agent_id") == "SET NULL", (
        f"expected sessions.agent_id ON DELETE SET NULL, got {fks!r}"
    )


def test_raw_delete_agent_nulls_dependent_sessions(tmp_path):
    """AC2 — raw `DELETE FROM agents` causes sessions to drop their
    agent_id (vs. the app-level path which re-points to the default)."""
    import asyncio

    path = tmp_path / "fk_action.sqlite3"
    store = ConversationStore(path)
    other = asyncio.run(store.create_agent(name="Other", description=""))
    sid = asyncio.run(store.create_session())["id"]
    asyncio.run(store.set_session_agent(sid, other["id"]))

    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("DELETE FROM agents WHERE id = ?", (other["id"],))
        conn.commit()
        row = conn.execute("SELECT id, agent_id FROM sessions WHERE id = ?", (sid,)).fetchone()
    assert row is not None, "session should survive agent deletion"
    assert row[1] is None, "agent_id should be NULL after raw agent DELETE"


# --- messages: drop INSERT OR REPLACE (AC5) --------------------------------


async def test_write_message_rejects_duplicate_id(tmp_path):
    """AC5 — writing two messages with the same id raises (vs. the
    pre-047 REPLACE that silently rewrote the row)."""
    path = tmp_path / "msg_unique.sqlite3"
    store = ConversationStore(path)
    sid = (await store.create_session())["id"]
    await store.write_message(sid, "m1", "q1", "a1")
    with pytest.raises(sqlite3.IntegrityError):
        await store.write_message(sid, "m1", "q2", "a2")


# --- migration (AC6, AC7, AC8, AC9) ----------------------------------------


def test_user_version_bumps_to_2_idempotently(tmp_path):
    """AC7 — migration takes a v1 DB *at least* to v2 (the 047 floor);
    re-init is a no-op. Anchored against the live constant so later
    migrations (048 → 3, …) just bump the assertion in lockstep with
    the constant — no manual edit needed here."""
    floor = ConversationStore._SCHEMA_VERSION_INTEGRITY_CONSTRAINTS
    path = tmp_path / "version.sqlite3"
    _make_pre_047_db(path)
    # Initial state: v1.
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 1

    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        first = conn.execute("PRAGMA user_version").fetchone()[0]
    assert first >= floor, f"047 migration should reach at least v{floor}, got {first}"

    # Re-construct: still at the same version (no double-run).
    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        second = conn.execute("PRAGMA user_version").fetchone()[0]
    assert second == first


def test_migration_preserves_existing_rows(tmp_path):
    """AC8 — every row pre-existing in a v1 DB survives the rebuild."""
    path = tmp_path / "preserve.sqlite3"
    _make_pre_047_db(
        path,
        seed={
            "sessions": [{"id": "S1", "title": "t"}],
            "messages": [
                {"id": "M1", "session_id": "S1"},
                {"id": "M2", "session_id": "S1"},
            ],
            "documents": [{"id": "D1", "session_id": "S1"}],
            "message_documents": [{"message_id": "M1", "document_id": "D1"}],
        },
    )

    ConversationStore(path)

    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        sessions = conn.execute("SELECT id, title, agent_id FROM sessions").fetchall()
        messages = conn.execute("SELECT id, session_id FROM messages ORDER BY id").fetchall()
        documents = conn.execute("SELECT id, session_id FROM documents").fetchall()
        joins = conn.execute("SELECT message_id, document_id FROM message_documents").fetchall()

    assert len(sessions) == 1 and sessions[0]["id"] == "S1"
    assert sessions[0]["title"] == "t"
    assert sessions[0]["agent_id"] == DEFAULT_AGENT_ID
    assert [m["id"] for m in messages] == ["M1", "M2"]
    assert [d["id"] for d in documents] == ["D1"]
    assert [(j["message_id"], j["document_id"]) for j in joins] == [("M1", "D1")]


def test_migration_cleans_orphan_message_documents(tmp_path):
    """AC6 — orphan join rows (left over from any pre-047 REPLACE
    weirdness) are removed during the migration. Legitimate joins
    survive."""
    path = tmp_path / "orphans.sqlite3"
    _make_pre_047_db(
        path,
        seed={
            "sessions": [{"id": "S1"}],
            "messages": [{"id": "M1", "session_id": "S1"}],
            "documents": [{"id": "D1", "session_id": "S1"}],
            "message_documents": [
                {"message_id": "M1", "document_id": "D1"},  # legitimate
            ],
        },
    )
    # Inject an orphan join row pointing at a non-existent message id.
    # FK enforcement is per-connection (off by default), so this lands.
    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO message_documents (message_id, document_id, created_at) "
            "VALUES ('ghost-message', 'D1', 0)"
        )

    ConversationStore(path)

    with sqlite3.connect(path) as conn:
        joins = conn.execute(
            "SELECT message_id, document_id FROM message_documents ORDER BY message_id"
        ).fetchall()
    assert joins == [("M1", "D1")], (
        f"expected the orphan ghost-message join to be cleaned, got {joins!r}"
    )


def test_migration_runs_exactly_once(tmp_path, monkeypatch):
    """AC9 — the inner rebuild helper fires once on a v1 DB and zero
    times on subsequent re-inits (the outer guard skips them)."""
    from app.db import store as store_module

    calls: list[Any] = []
    original = store_module.ConversationStore._rebuild_for_integrity_constraints

    def spy(p):
        calls.append(p)
        return original(p)

    monkeypatch.setattr(
        store_module.ConversationStore,
        "_rebuild_for_integrity_constraints",
        staticmethod(spy),
    )

    path = tmp_path / "once.sqlite3"
    _make_pre_047_db(path)

    ConversationStore(path)
    ConversationStore(path)
    ConversationStore(path)

    # First open does the work; subsequent opens see user_version=2 and skip.
    assert len(calls) == 1, f"expected the rebuild to fire once, got {len(calls)}"


# --- compatibility with 046 + seed (AC11) ----------------------------------


async def test_clear_all_reseeds_default_under_check(tmp_path):
    """AC11 — the re-seeded default has `is_default = 1` and survives
    the new CHECK constraint."""
    store = ConversationStore(tmp_path / "reseed.sqlite3")
    await store.clear_all()
    with sqlite3.connect(tmp_path / "reseed.sqlite3") as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT id, is_default FROM agents").fetchall()
    assert len(rows) == 1
    assert rows[0]["id"] == DEFAULT_AGENT_ID
    assert rows[0]["is_default"] == 1
