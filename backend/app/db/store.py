"""The application's relational database (its system of record).

Canonical schema reference: ``docs/data-model.md`` (ERD + per-table columns +
cascade rules + "what's NOT a table"). The schema-audit test
(``backend/tests/test_schema_audit.py``) pins the documented table set against
``sqlite_master`` so doc + code can't drift apart.

A small, **real** SQLite-backed store — not a mock. It exists so the simulator
can show a genuine relational database next to the RAG vector store: the
backend loads recent history (a read) and persists every conversation (a
write). SQLite maps to a managed SQL service in production (Azure SQL,
Amazon RDS/Aurora, Cloud SQL).

This is deliberately separate from ``app/rag`` (the *vector* store): one holds
transactional app state, the other holds embeddings for retrieval — two
different databases for two different jobs, exactly as in a real deployment.

The schema is session-scoped (002-interactive-chat): a ``sessions`` row per
conversation, ``messages`` rows (each persisting the RAG chunks retrieved for
it), and ``documents`` rows tracking uploaded PDFs. Deleting a session cascades
to its messages and documents.

Queries run in a worker thread so SQLite's blocking calls never stall the
async event loop.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import uuid
from functools import lru_cache
from pathlib import Path
from time import time
from typing import Any

from ..agent.prompts import AGENT_PROMPT, GUARDRAILS_PROMPT
from ..config import get_settings

# 043-persisted-agent: the seed default agent's user-visible identity. These
# are server-shipped strings (English-only, like AGENT_PROMPT / GUARDRAILS_PROMPT
# — UI chrome around the dialog is bilingual; the *content* the user replaces is
# the server's default). Imported by `db/seed.py` so callers don't reach into
# this module's private API.
DEFAULT_AGENT_ID = "agent-simulator-default"
DEFAULT_AGENT_NAME = "Agent Simulator"
DEFAULT_AGENT_DESCRIPTION = "AI Agent Simulator — explore how an agent works."


def _seed_default_agent_sync(conn: sqlite3.Connection) -> bool:
    """Insert the default agent row if it doesn't exist. Returns True when a
    row was inserted, False otherwise (idempotent).

    Shared between the schema's first-run migration, the lifespan startup seed,
    and `_clear_all_sync` (which deletes every agent and then re-seeds).
    """
    existing = conn.execute("SELECT id FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
    if existing is not None:
        return False
    now = time()
    conn.execute(
        "INSERT INTO agents (id, name, description, system_prompt, agent_prompt, "
        "model, enabled_tools, is_default, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, '[]', 1, ?, ?)",
        (
            DEFAULT_AGENT_ID,
            DEFAULT_AGENT_NAME,
            DEFAULT_AGENT_DESCRIPTION,
            GUARDRAILS_PROMPT,
            AGENT_PROMPT,
            get_settings().llm_model,
            now,
            now,
        ),
    )
    return True


def _agent_row(row: sqlite3.Row) -> dict[str, Any]:
    """Adapt a `sqlite3.Row` from the `agents` table into the JSON-friendly
    shape the API + FE consume. `enabled_tools` rides as a JSON string in
    SQLite; surface it as a real list."""
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "system_prompt": row["system_prompt"],
        "agent_prompt": row["agent_prompt"],
        "model": row["model"],
        "enabled_tools": json.loads(row["enabled_tools"] or "[]"),
        "is_default": bool(row["is_default"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    title      TEXT,
    -- 042-agent-anatomy added `agent_name`; 043-persisted-agent promotes the
    -- agent to its own row and points here via `agent_id`. The `agent_name`
    -- column is dropped by the 043 migration after backfilling into agents.name.
    -- 047-db-integrity-constraints: ON DELETE SET NULL — deleting an agent
    -- never silently wipes conversations; the app code path re-points to the
    -- default first (better UX), this is the schema-level backstop.
    agent_id   TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
-- 043-persisted-agent: the agent is a real, SQLite-persisted entity. Each
-- conversation owns its own row (clone-on-create from the default row, which is
-- preserved across `clear_all` by re-seeding). Edits PATCH this row directly;
-- conversations are insulated from each other.
-- 047-db-integrity-constraints: is_default carries a CHECK so an out-of-domain
-- integer is rejected at the DB level (pydantic already validates on the way in;
-- the CHECK is belt-and-braces against raw SQL or future code paths).
CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    agent_prompt  TEXT NOT NULL,
    model         TEXT NOT NULL,
    enabled_tools TEXT NOT NULL DEFAULT '[]', -- JSON list[str]; [] = no tools
    is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
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
    -- 027-skills: the skill names the agent loaded for this turn (JSON list),
    -- mirroring `chunks` so the "skills applied" badge survives reload/replay.
    skills     TEXT NOT NULL DEFAULT '[]',
    created_at REAL NOT NULL
);
-- 047-db-integrity-constraints: chunk_count >= 0 enforced at DB level. A
-- negative count would be nonsense (and would have slipped past pydantic if
-- the value came from a future code path or raw SQL).
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
    created_at  REAL NOT NULL
);
-- 040-message-attachments: per-message attachment join. A document is linked
-- to AT MOST ONE message (the turn that introduced it via the composer), so
-- the chip travels with that turn instead of staying sticky in the input.
-- Retrieval semantics are unaffected — the agent still queries vectors by
-- session, not by message. FK cascades both ways: deleting the message or
-- the document drops the link.
CREATE TABLE IF NOT EXISTS message_documents (
    message_id  TEXT NOT NULL REFERENCES messages(id)  ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at  REAL NOT NULL,
    PRIMARY KEY (message_id, document_id)
);
-- 048-persist-traces: every `TraceEvent` emitted during a chat or upload is
-- persisted in real-time. Denormalized single table — `session_id` rides on
-- every row for cheap per-session reads; `message_id` is not stored because
-- `message_id == trace_id` by construction (the chat endpoint reuses the
-- trace_id as the message id when persisting at end of run). `data`/`metrics`
-- are JSON blobs serialised with `json.dumps(default=str)` so unusual Python
-- objects in `data` (Path, datetime, …) coerce gracefully to strings.
CREATE TABLE IF NOT EXISTS trace_events (
    trace_id   TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    ts         REAL NOT NULL,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    stage      TEXT NOT NULL,
    phase      TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    data       TEXT NOT NULL DEFAULT '{}',
    metrics    TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (trace_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_trace_events_session
    ON trace_events(session_id, ts);
-- 027-skills: the global, agent-loadable skill catalog. A skill is a named
-- instruction bundle the agent advertises by name+description and loads on
-- demand (the `body`) via the `load_skill` tool. `name` is unique so the model
-- can reference it unambiguously. Independent of sessions (global catalog).
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

# The first user message labels the conversation; truncate so the sidebar list
# stays tidy (D7).
_TITLE_MAX = 60


class DuplicateSkillName(ValueError):
    """Raised when creating/renaming a skill to a `name` already in the catalog.

    027-skills: `name` is the unique handle the model references in `load_skill`,
    so the catalog rejects duplicates. The REST layer maps this to a 409.
    """


class CannotDeleteDefaultAgent(ValueError):
    """Raised when ``DELETE /api/agents/{id}`` targets the seed default row.

    044-shared-agent-catalog: the default is the always-there fallback when
    a session's agent is deleted; allowing its deletion would orphan every
    conversation. The REST layer maps this to a 409.
    """


class UnknownAgentId(ValueError):
    """Raised when ``set_session_agent`` is called with an agent_id that
    doesn't exist in the catalog (044). The REST layer maps this to a 422."""

    def __init__(self, agent_id: str) -> None:
        super().__init__(f"agent '{agent_id}' does not exist")
        self.agent_id = agent_id


class AgentLocked(ValueError):
    """Raised when ``set_session_agent`` tries to swap the agent on a
    session that has already produced at least one persisted turn
    (045-composer-agent-selector).

    The visualizer's "one agent per chat" invariant: a started
    conversation locks its agent. The REST layer maps this to a 409
    Conflict with a structured body (`{detail: "agent_locked",
    message_count: <n>}`) so the FE can surface the lock to a stale
    tab gracefully.
    """

    def __init__(self, message_count: int) -> None:
        super().__init__(f"agent is locked: conversation already has {message_count} message(s)")
        self.message_count = message_count


class ConversationStore:
    """Session-scoped conversation store backed by SQLite."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            self._migrate(conn)
        # 047-db-integrity-constraints: the rebuild-and-copy migration needs
        # `PRAGMA foreign_keys = OFF` for the duration, which can't toggle
        # mid-transaction — run it on its own dedicated connection AFTER the
        # outer one is committed and closed. Gated by `PRAGMA user_version`
        # so re-boots are no-ops.
        ConversationStore._migrate_to_integrity_constraints(self.path)
        # 048-persist-traces: additive migration — creates the `trace_events`
        # table on existing pre-048 DBs. Gated by `PRAGMA user_version` so
        # subsequent boots are no-ops. Fresh DBs already have it via _SCHEMA.
        ConversationStore._migrate_to_persist_traces(self.path)

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        """Forward-only column adds for DBs created before a column existed.

        ``CREATE TABLE IF NOT EXISTS`` never alters an existing table, so a dev
        database from before 027-skills has a ``messages`` table without the
        ``skills`` column. Add it lazily (idempotent: skip when already present).
        """
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(messages)")}
        if "skills" not in cols:
            conn.execute("ALTER TABLE messages ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'")
        # 042 → 043 → 044 timeline:
        #   042 added `sessions.agent_name` (a single column).
        #   043 promoted the agent to the `agents` table + per-session clone,
        #     adding `sessions.agent_id` and dropping `agent_name`.
        #   044 flips 043's 1:1 model to a SHARED catalog: every conversation
        #     points to the same default agent (and the user can create more
        #     named agents in a follow-up UI). Per-session clones are deleted
        #     and their sessions re-pointed to the default.
        # The migration steps below are each idempotent so re-runs are no-ops.
        session_cols = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
        if "agent_id" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN agent_id TEXT REFERENCES agents(id)")

        # Seed the default first — every other step assumes it exists.
        _seed_default_agent_sync(conn)
        ConversationStore._migrate_to_shared_catalog(conn)
        # Drop the legacy 042 column once any data is in agents.name.
        session_cols = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
        if "agent_name" in session_cols:
            try:
                conn.execute("ALTER TABLE sessions DROP COLUMN agent_name")
            except sqlite3.OperationalError:
                # SQLite < 3.35 — leave it in place; new code never writes it.
                pass

    # 044-shared-agent-catalog: bumped to mark that the one-shot clone drop
    # has happened. Without this flag the migration would re-run on every
    # boot and delete every named agent the user later created via the
    # catalog UI (every non-default row would look like a 043 clone).
    _SCHEMA_VERSION_SHARED_CATALOG = 1
    # 047-db-integrity-constraints: bumped to mark that the per-table rebuild
    # for the new CHECKs + `ON DELETE SET NULL` has happened. Idempotent
    # across boots; existing dev DBs upgrade once on next start.
    _SCHEMA_VERSION_INTEGRITY_CONSTRAINTS = 2
    # 048-persist-traces: bumped after the additive `trace_events` table is
    # created. Pure `CREATE TABLE IF NOT EXISTS` — no table rebuild needed.
    _SCHEMA_VERSION_PERSIST_TRACES = 3

    @staticmethod
    def _migrate_to_shared_catalog(conn: sqlite3.Connection) -> None:
        """One-shot 044 migration: drop the 043 per-session clones and
        re-point every session to the seed default.

        Gated by ``PRAGMA user_version`` so it runs exactly once per database.
        After the version bump, subsequent boots are no-ops — preserving any
        named agents the user later creates via the catalog UI.
        """
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version >= ConversationStore._SCHEMA_VERSION_SHARED_CATALOG:
            return

        default = conn.execute("SELECT id FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
        if default is None:
            return  # _seed_default_agent_sync should have run first
        default_id = default["id"]

        # 042 → 043 carried `sessions.agent_name` onto the clones' name; before
        # we drop those clones, fold any user-set name back into the default
        # so the upgrade doesn't lose the rename (best-effort: if multiple
        # sessions had different names, the most recently updated one wins).
        session_cols = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
        has_legacy_name = "agent_name" in session_cols
        if has_legacy_name:
            last_named = conn.execute(
                "SELECT agent_name FROM sessions WHERE agent_name IS NOT NULL "
                "ORDER BY updated_at DESC LIMIT 1"
            ).fetchone()
            if last_named and last_named["agent_name"]:
                conn.execute(
                    "UPDATE agents SET name = ?, updated_at = ? WHERE id = ?",
                    (last_named["agent_name"], time(), default_id),
                )

        # Point every session at the default.
        conn.execute(
            "UPDATE sessions SET agent_id = ? WHERE agent_id IS NULL OR agent_id != ?",
            (default_id, default_id),
        )
        # Drop every non-default row (the 043 clones).
        conn.execute("DELETE FROM agents WHERE is_default = 0")
        # Mark the migration as done so future boots leave user-created
        # agents alone.
        conn.execute(f"PRAGMA user_version = {ConversationStore._SCHEMA_VERSION_SHARED_CATALOG}")

    @staticmethod
    def _migrate_to_integrity_constraints(path: Path) -> None:
        """047-db-integrity-constraints: outer guard. Checks the schema
        version and calls :meth:`_rebuild_for_integrity_constraints` only
        when an upgrade is needed.

        Two layers so AC9's spy can pin "the rebuild ran exactly once" —
        the outer is called every boot, but only the inner does the
        table-rebuild dance.
        """
        target = ConversationStore._SCHEMA_VERSION_INTEGRITY_CONSTRAINTS
        with sqlite3.connect(path) as conn:
            current = conn.execute("PRAGMA user_version").fetchone()[0]
        if current >= target:
            return
        ConversationStore._rebuild_for_integrity_constraints(path)

    @staticmethod
    def _rebuild_for_integrity_constraints(path: Path) -> None:
        """Do the actual SQLite table-rebuild dance.

        SQLite has no ``ALTER TABLE ADD CONSTRAINT``; the canonical workaround
        is to rebuild each table and copy the rows. Wrapped in one transaction
        with FK enforcement temporarily disabled (the only way to drop a
        parent table without tripping child FKs), then ``foreign_key_check``
        validates the result before commit.

        Opens its own connection because ``PRAGMA foreign_keys`` is a no-op
        inside a transaction — the outer ``__init__`` connection might be in
        one (legacy implicit-transaction mode), so we need a fresh handle.
        """
        target = ConversationStore._SCHEMA_VERSION_INTEGRITY_CONSTRAINTS
        conn = sqlite3.connect(path)
        try:
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.execute("BEGIN")
            # --- sessions: add ON DELETE SET NULL to the agent_id FK ----------
            conn.execute(
                """
                CREATE TABLE sessions_new (
                    id         TEXT PRIMARY KEY,
                    title      TEXT,
                    agent_id   TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "INSERT INTO sessions_new (id, title, agent_id, created_at, updated_at) "
                "SELECT id, title, agent_id, created_at, updated_at FROM sessions"
            )
            conn.execute("DROP TABLE sessions")
            conn.execute("ALTER TABLE sessions_new RENAME TO sessions")

            # --- agents: add CHECK (is_default IN (0, 1)) ---------------------
            conn.execute(
                """
                CREATE TABLE agents_new (
                    id            TEXT PRIMARY KEY,
                    name          TEXT NOT NULL,
                    description   TEXT NOT NULL DEFAULT '',
                    system_prompt TEXT NOT NULL,
                    agent_prompt  TEXT NOT NULL,
                    model         TEXT NOT NULL,
                    enabled_tools TEXT NOT NULL DEFAULT '[]',
                    is_default    INTEGER NOT NULL DEFAULT 0
                                  CHECK (is_default IN (0, 1)),
                    created_at    REAL NOT NULL,
                    updated_at    REAL NOT NULL
                )
                """
            )
            conn.execute(
                "INSERT INTO agents_new (id, name, description, system_prompt, "
                "agent_prompt, model, enabled_tools, is_default, created_at, updated_at) "
                "SELECT id, name, description, system_prompt, agent_prompt, model, "
                "enabled_tools, is_default, created_at, updated_at FROM agents"
            )
            conn.execute("DROP TABLE agents")
            conn.execute("ALTER TABLE agents_new RENAME TO agents")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_agents_is_default ON agents(is_default)")

            # --- documents: add CHECK (chunk_count >= 0) ----------------------
            conn.execute(
                """
                CREATE TABLE documents_new (
                    id          TEXT PRIMARY KEY,
                    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    filename    TEXT NOT NULL,
                    chunk_count INTEGER NOT NULL DEFAULT 0
                                CHECK (chunk_count >= 0),
                    created_at  REAL NOT NULL
                )
                """
            )
            conn.execute(
                "INSERT INTO documents_new (id, session_id, filename, chunk_count, created_at) "
                "SELECT id, session_id, filename, chunk_count, created_at FROM documents"
            )
            conn.execute("DROP TABLE documents")
            conn.execute("ALTER TABLE documents_new RENAME TO documents")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_documents_session "
                "ON documents(session_id, created_at)"
            )
            # message_documents indexes survive (the table itself is untouched),
            # but recreate defensively in case a future variant changes that.
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_message_documents_message "
                "ON message_documents(message_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_message_documents_document "
                "ON message_documents(document_id)"
            )

            # --- one-shot orphan cleanup on message_documents -----------------
            # The pre-047 `INSERT OR REPLACE INTO messages` could leave join
            # rows pointing at the (replaced) id intact because the message_id
            # didn't change — bypassing the join's `ON DELETE CASCADE`. Sweep
            # any such orphans now so the next foreign_key_check passes.
            conn.execute(
                "DELETE FROM message_documents WHERE message_id NOT IN (SELECT id FROM messages)"
            )
            conn.execute(
                "DELETE FROM message_documents WHERE document_id NOT IN (SELECT id FROM documents)"
            )

            # Sanity-check before flipping the version.
            offenders = conn.execute("PRAGMA foreign_key_check").fetchall()
            if offenders:
                raise RuntimeError(f"047 migration left FK violations: {offenders!r}")
            conn.execute(f"PRAGMA user_version = {target}")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.close()

    @staticmethod
    def _migrate_to_persist_traces(path: Path) -> None:
        """048-persist-traces: add the `trace_events` table + its index.

        Pure additive — no table rebuild, no FK toggling. Gated by
        ``PRAGMA user_version`` so subsequent boots are no-ops. Fresh DBs
        already have the table from ``_SCHEMA``; this is for the v2 → v3
        upgrade path.
        """
        target = ConversationStore._SCHEMA_VERSION_PERSIST_TRACES
        with sqlite3.connect(path) as conn:
            current = conn.execute("PRAGMA user_version").fetchone()[0]
            if current >= target:
                return
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS trace_events (
                    trace_id   TEXT NOT NULL,
                    seq        INTEGER NOT NULL,
                    ts         REAL NOT NULL,
                    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
                    stage      TEXT NOT NULL,
                    phase      TEXT NOT NULL,
                    label      TEXT NOT NULL DEFAULT '',
                    data       TEXT NOT NULL DEFAULT '{}',
                    metrics    TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY (trace_id, seq)
                );
                CREATE INDEX IF NOT EXISTS idx_trace_events_session
                    ON trace_events(session_id, ts);
                """
            )
            conn.execute(f"PRAGMA user_version = {target}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        # FK constraints are off by default in SQLite; enable per connection so
        # deleting a session cascades to its messages and documents.
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    # --- sessions ------------------------------------------------------------

    def _create_session_sync(self, session_id: str | None, title: str | None) -> dict[str, Any]:
        """Create a session linked to the default agent (044-shared-agent-catalog).

        The agent is **shared** across conversations: this just points the new
        session at the existing default row (no clone). Editing the agent in
        any conversation affects every conversation that uses it; new agents
        are created via ``POST /api/agents`` from the catalog header.
        """
        sid = session_id or uuid.uuid4().hex
        now = time()
        with self._connect() as conn:
            # Defense in depth: re-seed if the default was wiped — the lifespan
            # and the clear handler also do this, but we never want a chat to
            # find a session with a dangling agent_id.
            _seed_default_agent_sync(conn)
            default = conn.execute("SELECT * FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
            if default is None:
                raise RuntimeError("default agent missing — seeding failed")
            conn.execute(
                "INSERT INTO sessions (id, title, agent_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (sid, title, default["id"], now, now),
            )
        return {
            "id": sid,
            "title": title,
            "created_at": now,
            "updated_at": now,
            # 045-composer-agent-selector: fresh session = 0 turns; the FE chip
            # uses this to render itself unlocked on a brand-new conversation.
            "message_count": 0,
            "agent": _agent_row(default),
        }

    def _ensure_session_sync(self, session_id: str) -> dict[str, Any]:
        existing = self._get_session_sync(session_id)
        if existing is not None:
            return existing
        return self._create_session_sync(session_id, None)

    @staticmethod
    def _read_session_with_agent(
        conn: sqlite3.Connection, session_id: str
    ) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT id, title, agent_id, created_at, updated_at FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            return None
        agent_row = (
            conn.execute("SELECT * FROM agents WHERE id = ?", (row["agent_id"],)).fetchone()
            if row["agent_id"]
            else None
        )
        # 045-composer-agent-selector: expose `message_count` on every single-
        # session read too (the list endpoint already had it), so the FE chip
        # can derive the lock without a follow-up `GET /api/sessions`.
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", (session_id,)
        ).fetchone()["n"]
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "message_count": int(count),
            "agent": _agent_row(agent_row) if agent_row else None,
        }

    def _get_session_sync(self, session_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            return self._read_session_with_agent(conn, session_id)

    def _list_sessions_sync(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT s.id, s.title, s.agent_id, s.created_at, s.updated_at,
                       (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
                FROM sessions s
                ORDER BY s.updated_at DESC, s.created_at DESC
                """
            ).fetchall()
            # One follow-up query for agents (small N): keeps the SQL simple and
            # the JSON-decode of `enabled_tools` in one place (`_agent_row`).
            agent_ids = [r["agent_id"] for r in rows if r["agent_id"]]
            agents_by_id: dict[str, dict[str, Any]] = {}
            if agent_ids:
                placeholders = ",".join("?" * len(agent_ids))
                for ar in conn.execute(
                    f"SELECT * FROM agents WHERE id IN ({placeholders})", agent_ids
                ):
                    agents_by_id[ar["id"]] = _agent_row(ar)
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "message_count": r["message_count"],
                "agent": agents_by_id.get(r["agent_id"]) if r["agent_id"] else None,
            }
            for r in rows
        ]

    def _delete_session_sync(self, session_id: str) -> dict[str, Any]:
        """Delete a session row + its messages/documents (FK cascade).

        044-shared-agent-catalog: the agent is **shared** across conversations,
        so this does NOT touch the `agents` table — the same row backs every
        other conversation that uses it. The Lumis-style catalog UI is the
        only path that removes agents (``DELETE /api/agents/{id}``).
        """
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        # Embeddings are intentionally left in the vector store (D6); only the
        # relational rows (and, by FK cascade, this session's messages/documents)
        # are removed here.
        return {"deleted": cur.rowcount > 0, "session_id": session_id}

    # --- agents (043-persisted-agent) ---------------------------------------

    # Editable agent fields the API surfaces; tightly bound by the pydantic
    # `AgentPatch` model on the way in.
    _AGENT_EDITABLE = (
        "name",
        "description",
        "system_prompt",
        "agent_prompt",
        "model",
        "enabled_tools",
    )

    def _get_agent_sync(self, agent_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return _agent_row(row) if row else None

    def _update_agent_sync(self, agent_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        """Partial-update an agent row. Unknown keys are silently dropped (the
        endpoint validates them via pydantic before calling here)."""
        fields = []
        values: list[Any] = []
        for key in self._AGENT_EDITABLE:
            if key not in patch:
                continue
            value = patch[key]
            if key == "enabled_tools":
                value = json.dumps(list(value or []))
            fields.append(f"{key} = ?")
            values.append(value)
        if not fields:
            return self._get_agent_sync(agent_id)
        fields.append("updated_at = ?")
        values.append(time())
        values.append(agent_id)
        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE agents SET {', '.join(fields)} WHERE id = ?",
                values,
            )
            if cur.rowcount == 0:
                return None
        return self._get_agent_sync(agent_id)

    def _list_agents_sync(self) -> list[dict[str, Any]]:
        """The full catalog (044-shared-agent-catalog). Default first, then
        user-created agents alphabetically."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM agents ORDER BY is_default DESC, name ASC, created_at ASC"
            ).fetchall()
        return [_agent_row(r) for r in rows]

    def _create_agent_sync(
        self,
        *,
        name: str | None = None,
        description: str | None = None,
        clone_from: str | None = None,
    ) -> dict[str, Any]:
        """Create a new agent in the catalog (044).

        Cloned from ``clone_from`` when provided, else from the default. The
        new row carries ``is_default=0`` regardless. ``name`` defaults to
        ``"<source>.name (cópia)"`` so consecutive clones are visually unique.
        """
        with self._connect() as conn:
            _seed_default_agent_sync(conn)
            source = None
            if clone_from:
                source = conn.execute("SELECT * FROM agents WHERE id = ?", (clone_from,)).fetchone()
            if source is None:
                source = conn.execute(
                    "SELECT * FROM agents WHERE is_default = 1 LIMIT 1"
                ).fetchone()
            if source is None:
                raise RuntimeError("default agent missing — seeding failed")
            new_id = uuid.uuid4().hex
            now = time()
            final_name = name if (name and name.strip()) else f"{source['name']} (cópia)"
            final_desc = description if description is not None else source["description"]
            conn.execute(
                "INSERT INTO agents (id, name, description, system_prompt, "
                "agent_prompt, model, enabled_tools, is_default, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
                (
                    new_id,
                    final_name[:60],
                    final_desc[:240] if isinstance(final_desc, str) else "",
                    source["system_prompt"],
                    source["agent_prompt"],
                    source["model"],
                    source["enabled_tools"],
                    now,
                    now,
                ),
            )
            new_row = conn.execute("SELECT * FROM agents WHERE id = ?", (new_id,)).fetchone()
        return _agent_row(new_row)

    def _delete_agent_sync(self, agent_id: str) -> dict[str, Any] | None:
        """Delete a non-default agent (044). Returns the count of sessions
        re-pointed to the default. Returns ``None`` if the id is unknown;
        raises :class:`CannotDeleteDefaultAgent` for the default row."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, is_default FROM agents WHERE id = ?", (agent_id,)
            ).fetchone()
            if row is None:
                return None
            if row["is_default"]:
                raise CannotDeleteDefaultAgent(
                    "the default agent cannot be deleted; create another and switch to it"
                )
            default = conn.execute("SELECT id FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
            if default is None:
                raise RuntimeError("default agent missing — seeding failed")
            cur = conn.execute(
                "UPDATE sessions SET agent_id = ? WHERE agent_id = ?",
                (default["id"], agent_id),
            )
            conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        return {
            "deleted": True,
            "id": agent_id,
            "sessions_repointed": cur.rowcount,
            "default_agent_id": default["id"],
        }

    def _set_session_agent_sync(self, session_id: str, agent_id: str) -> dict[str, Any] | None:
        """Point a session at a different agent (044). Returns the updated
        session (with the new inline agent), or ``None`` on unknown ids.

        045-composer-agent-selector: a session with ≥1 persisted message
        locks its agent — swapping to a *different* one raises
        :class:`AgentLocked` (the REST layer maps that to 409). A PATCH
        that names the SAME agent the session already has is treated as a
        no-op (200) so the FE can dispatch unconditionally.
        """
        with self._connect() as conn:
            agent_row = conn.execute("SELECT id FROM agents WHERE id = ?", (agent_id,)).fetchone()
            if agent_row is None:
                raise UnknownAgentId(agent_id)
            # Lock check — only fires when the requested agent differs from
            # the one already linked. Same-id PATCH is a harmless no-op.
            current = conn.execute(
                "SELECT agent_id FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if current is None:
                return None
            if current["agent_id"] != agent_id:
                count = conn.execute(
                    "SELECT COUNT(*) AS n FROM messages WHERE session_id = ?",
                    (session_id,),
                ).fetchone()["n"]
                if count > 0:
                    raise AgentLocked(int(count))
            cur = conn.execute(
                "UPDATE sessions SET agent_id = ? WHERE id = ?", (agent_id, session_id)
            )
            if cur.rowcount == 0:
                return None
            return self._read_session_with_agent(conn, session_id)

    def _clear_all_sync(self) -> dict[str, Any]:
        """Wipe the entire relational store (025-clear-databases).

        The global "reset" companion to ``delete_session``: every session,
        message and document row is removed. Counts the rows first, then clears
        all three tables and reports how many of each were deleted. The
        ``DELETE FROM sessions`` alone would cascade (FK ``ON DELETE CASCADE``,
        enabled per connection), but the dependent tables are cleared explicitly
        too so the wipe is total even if that cascade is ever disabled.
        """
        with self._connect() as conn:
            counts = {
                "sessions_deleted": conn.execute("SELECT COUNT(*) AS n FROM sessions").fetchone()[
                    "n"
                ],
                "messages_deleted": conn.execute("SELECT COUNT(*) AS n FROM messages").fetchone()[
                    "n"
                ],
                "documents_deleted": conn.execute("SELECT COUNT(*) AS n FROM documents").fetchone()[
                    "n"
                ],
                # 027-skills: the skill catalog is user data, so a global reset
                # wipes it too (the built-in corpus is the only thing kept).
                "skills_deleted": conn.execute("SELECT COUNT(*) AS n FROM skills").fetchone()["n"],
                # 043-persisted-agent: every per-conversation cloned agent goes,
                # plus the default (which is immediately re-seeded below so the
                # next `create_session` works without a restart).
                "agents_deleted": conn.execute("SELECT COUNT(*) AS n FROM agents").fetchone()["n"],
                # 048-persist-traces: the trace event log is user data — wipe it
                # with everything else. The FK CASCADE from sessions would handle
                # most rows for free, but counting + DELETEing explicitly keeps
                # the contract honest (and handles rows whose session was already
                # gone from a prior incomplete wipe).
                "trace_events_deleted": conn.execute(
                    "SELECT COUNT(*) AS n FROM trace_events"
                ).fetchone()["n"],
            }
            # 048-persist-traces: DELETE trace_events first so its denormalized
            # session_id FK doesn't trip during the cascade. Order is
            # belt-and-braces — the CASCADE would handle it either way.
            conn.execute("DELETE FROM trace_events")
            conn.execute("DELETE FROM documents")
            conn.execute("DELETE FROM messages")
            conn.execute("DELETE FROM sessions")
            conn.execute("DELETE FROM skills")
            conn.execute("DELETE FROM agents")
            # Re-seed the default agent immediately so the next `create_session`
            # has something to clone (the lifespan seed only runs on startup).
            _seed_default_agent_sync(conn)
        return {k: int(v) for k, v in counts.items()}

    # --- trace events (048-persist-traces) -----------------------------------

    def _write_trace_event_sync(self, event_dict: dict[str, Any]) -> None:
        """Persist a single `TraceEvent` row.

        `data`/`metrics` are JSON-encoded with `default=str` so unusual Python
        objects in `data` (Path, datetime, bytes, …) coerce gracefully into
        strings rather than crashing the trace pipeline.
        """
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO trace_events "
                "(trace_id, seq, ts, session_id, stage, phase, label, data, metrics) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    event_dict["trace_id"],
                    event_dict["seq"],
                    event_dict["ts"],
                    event_dict.get("session_id"),
                    event_dict["stage"],
                    event_dict["phase"],
                    event_dict.get("label", ""),
                    json.dumps(event_dict.get("data") or {}, default=str),
                    json.dumps(event_dict.get("metrics") or {}, default=str),
                ),
            )

    def _get_trace_events_sync(self, trace_id: str) -> list[dict[str, Any]]:
        """Return every persisted event for ``trace_id``, ordered by ``seq``.

        Each row is decoded back into the same shape the in-memory
        ``TraceEvent`` carries — ``data`` and ``metrics`` are real dicts.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT trace_id, seq, ts, stage, phase, label, data, metrics "
                "FROM trace_events WHERE trace_id = ? ORDER BY seq ASC",
                (trace_id,),
            ).fetchall()
        return [
            {
                "trace_id": r["trace_id"],
                "seq": r["seq"],
                "ts": r["ts"],
                "stage": r["stage"],
                "phase": r["phase"],
                "label": r["label"],
                "data": json.loads(r["data"] or "{}"),
                "metrics": json.loads(r["metrics"] or "{}"),
            }
            for r in rows
        ]

    def _get_trace_summary_sync(self, trace_id: str) -> dict[str, Any] | None:
        """Rebuild the ``TraceSummary`` shape (``trace_id`` + ``message`` +
        ``answer`` + ``events``) from the DB — the read path that fires when
        the in-memory ``TraceStore`` has evicted the trace.

        Joins ``trace_events`` (event list) with ``messages`` (so the user's
        question + the assistant's answer survive too — recall ``message_id ==
        trace_id``). Returns ``None`` if neither side has rows so the endpoint
        can 404 cleanly.
        """
        events = self._get_trace_events_sync(trace_id)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT message, answer FROM messages WHERE id = ?", (trace_id,)
            ).fetchone()
        if not events and row is None:
            return None
        return {
            "trace_id": trace_id,
            "message": row["message"] if row else "",
            "answer": row["answer"] if row else "",
            "events": events,
        }

    # --- skills (027-skills) -------------------------------------------------

    @staticmethod
    def _skill_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "body": row["body"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _create_skill_sync(self, name: str, description: str, body: str) -> dict[str, Any]:
        sid = uuid.uuid4().hex
        now = time()
        try:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO skills (id, name, description, body, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (sid, name, description, body, now, now),
                )
        except sqlite3.IntegrityError as exc:  # UNIQUE(name)
            raise DuplicateSkillName(f"a skill named '{name}' already exists") from exc
        return {
            "id": sid,
            "name": name,
            "description": description,
            "body": body,
            "created_at": now,
            "updated_at": now,
        }

    def _list_skills_sync(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, description, body, created_at, updated_at "
                "FROM skills ORDER BY name ASC"
            ).fetchall()
        return [self._skill_row(r) for r in rows]

    def _get_skill_sync(self, skill_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, name, description, body, created_at, updated_at "
                "FROM skills WHERE id = ?",
                (skill_id,),
            ).fetchone()
        return self._skill_row(row) if row else None

    def _get_skill_by_name_sync(self, name: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, name, description, body, created_at, updated_at "
                "FROM skills WHERE name = ?",
                (name,),
            ).fetchone()
        return self._skill_row(row) if row else None

    def _update_skill_sync(
        self, skill_id: str, name: str, description: str, body: str
    ) -> dict[str, Any] | None:
        now = time()
        try:
            with self._connect() as conn:
                cur = conn.execute(
                    "UPDATE skills SET name = ?, description = ?, body = ?, updated_at = ? "
                    "WHERE id = ?",
                    (name, description, body, now, skill_id),
                )
                if cur.rowcount == 0:
                    return None
        except sqlite3.IntegrityError as exc:  # renamed onto an existing name
            raise DuplicateSkillName(f"a skill named '{name}' already exists") from exc
        return self._get_skill_sync(skill_id)

    def _delete_skill_sync(self, skill_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM skills WHERE id = ?", (skill_id,))
        return {"deleted": cur.rowcount > 0, "id": skill_id}

    # --- messages ------------------------------------------------------------

    def _write_message_sync(
        self,
        session_id: str,
        message_id: str,
        message: str,
        answer: str,
        chunks: list[dict[str, Any]] | None,
        skills: list[str] | None,
        attached_document_ids: list[str] | None,
    ) -> dict[str, Any]:
        now = time()
        with self._connect() as conn:
            # 047-db-integrity-constraints: plain INSERT (was INSERT OR REPLACE).
            # Turns are immutable: a duplicate id is a real bug, not a race to
            # paper over. Letting REPLACE rewrite a row also bypassed
            # `message_documents.ON DELETE CASCADE` (the id is unchanged, so the
            # cascade never fired), which could orphan the join. Fail loud now.
            conn.execute(
                "INSERT INTO messages "
                "(id, session_id, message, answer, chunks, skills, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    message_id,
                    session_id,
                    message,
                    answer,
                    json.dumps(chunks or []),
                    json.dumps(skills or []),
                    now,
                ),
            )
            # 040-message-attachments: link uploaded docs to the turn that
            # introduced them, in the same transaction as the message itself.
            # Two guards keep this honest:
            #   (a) the doc must belong to this session — stale ids from a
            #       client racing across sessions are dropped silently (AC3);
            #   (b) the doc must not already be linked to another message —
            #       a doc belongs to AT MOST ONE turn (AC4). The composite PK
            #       on (message_id, document_id) is belt-and-braces against
            #       same-message duplicates.
            for doc_id in attached_document_ids or []:
                doc_row = conn.execute(
                    "SELECT 1 FROM documents WHERE id = ? AND session_id = ?",
                    (doc_id, session_id),
                ).fetchone()
                if doc_row is None:
                    continue
                already_linked = conn.execute(
                    "SELECT 1 FROM message_documents WHERE document_id = ?",
                    (doc_id,),
                ).fetchone()
                if already_linked is not None:
                    continue
                conn.execute(
                    "INSERT INTO message_documents "
                    "(message_id, document_id, created_at) VALUES (?, ?, ?)",
                    (message_id, doc_id, now),
                )
            # Bump activity (drives recent-first ordering) and label the session
            # by its first message if it has no title yet (D7).
            conn.execute(
                "UPDATE sessions SET updated_at = ?, title = COALESCE(title, ?) WHERE id = ?",
                (now, message[:_TITLE_MAX], session_id),
            )
            total = conn.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", (session_id,)
            ).fetchone()["n"]
        return {
            "table": "messages",
            "engine": "sqlite",
            "operation": "INSERT",
            "row_id": message_id,
            "session_id": session_id,
            "total_rows": int(total),
        }

    def _read_history_sync(self, session_id: str, limit: int) -> dict[str, Any]:
        with self._connect() as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", (session_id,)
            ).fetchone()["n"]
            rows = conn.execute(
                "SELECT message, answer FROM messages WHERE session_id = ? "
                "ORDER BY created_at DESC LIMIT ?",
                (session_id, limit),
            ).fetchall()
        # Oldest-first so it reads naturally as a conversation transcript.
        recent = [{"message": r["message"], "answer": r["answer"]} for r in reversed(rows)]
        return {
            "table": "messages",
            "engine": "sqlite",
            "session_id": session_id,
            "total_rows": int(total),
            "recent": recent,
        }

    def _list_messages_sync(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, message, answer, chunks, skills, created_at FROM messages "
                "WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            ).fetchall()
            # 040-message-attachments: load the per-message attachments in one
            # extra query and group in Python — keeps the message read cheap
            # and the join optional (missing → []).
            doc_rows = conn.execute(
                """
                SELECT md.message_id AS message_id,
                       d.id          AS document_id,
                       d.filename    AS filename,
                       d.chunk_count AS chunk_count,
                       d.created_at  AS created_at
                FROM message_documents md
                JOIN documents d ON d.id = md.document_id
                JOIN messages  m ON m.id = md.message_id
                WHERE m.session_id = ?
                ORDER BY md.rowid ASC
                """,
                (session_id,),
            ).fetchall()
        by_message: dict[str, list[dict[str, Any]]] = {}
        for d in doc_rows:
            by_message.setdefault(d["message_id"], []).append(
                {
                    "document_id": d["document_id"],
                    "filename": d["filename"],
                    "chunk_count": d["chunk_count"],
                    "created_at": d["created_at"],
                }
            )
        return [
            {
                "id": r["id"],
                "message": r["message"],
                "answer": r["answer"],
                "chunks": json.loads(r["chunks"] or "[]"),
                # 027-skills: the skill names applied to this turn (badge source).
                "skills": json.loads(r["skills"] or "[]"),
                # 040-message-attachments: docs the user attached on this turn.
                "documents": by_message.get(r["id"], []),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    # --- documents -----------------------------------------------------------

    def _add_document_sync(
        self, session_id: str, document_id: str, filename: str, chunk_count: int
    ) -> dict[str, Any]:
        now = time()
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO documents "
                "(id, session_id, filename, chunk_count, created_at) VALUES (?, ?, ?, ?, ?)",
                (document_id, session_id, filename, chunk_count, now),
            )
        return {
            "document_id": document_id,
            "session_id": session_id,
            "filename": filename,
            "chunk_count": chunk_count,
            "created_at": now,
        }

    def _list_documents_sync(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, filename, chunk_count, created_at FROM documents "
                "WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            ).fetchall()
        return [
            {
                "document_id": r["id"],
                "filename": r["filename"],
                "chunk_count": r["chunk_count"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def _delete_document_sync(self, session_id: str, document_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM documents WHERE id = ? AND session_id = ?",
                (document_id, session_id),
            )
        return {"deleted": cur.rowcount > 0, "document_id": document_id}

    # --- async public API ----------------------------------------------------

    async def create_session(
        self, session_id: str | None = None, title: str | None = None
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self._create_session_sync, session_id, title)

    async def ensure_session(self, session_id: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._ensure_session_sync, session_id)

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_session_sync, session_id)

    async def list_sessions(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_sessions_sync)

    async def delete_session(self, session_id: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._delete_session_sync, session_id)

    # 042-agent-anatomy's `update_session(agent_name=...)` was superseded by
    # `update_agent` (043-persisted-agent). The endpoint is gone too.

    # --- agents (043-persisted-agent) ---------------------------------------

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_agent_sync, agent_id)

    async def update_agent(self, agent_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._update_agent_sync, agent_id, patch)

    async def list_agents(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_agents_sync)

    async def create_agent(
        self,
        *,
        name: str | None = None,
        description: str | None = None,
        clone_from: str | None = None,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._create_agent_sync,
            name=name,
            description=description,
            clone_from=clone_from,
        )

    async def delete_agent(self, agent_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._delete_agent_sync, agent_id)

    async def set_session_agent(self, session_id: str, agent_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._set_session_agent_sync, session_id, agent_id)

    async def clear_all(self) -> dict[str, Any]:
        return await asyncio.to_thread(self._clear_all_sync)

    # --- trace events (048-persist-traces) -----------------------------------

    async def write_trace_event(self, event_dict: dict[str, Any]) -> None:
        return await asyncio.to_thread(self._write_trace_event_sync, event_dict)

    async def get_trace_events(self, trace_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._get_trace_events_sync, trace_id)

    async def get_trace_summary(self, trace_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_trace_summary_sync, trace_id)

    async def write_message(
        self,
        session_id: str,
        message_id: str,
        message: str,
        answer: str,
        chunks: list[dict[str, Any]] | None = None,
        skills: list[str] | None = None,
        attached_document_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._write_message_sync,
            session_id,
            message_id,
            message,
            answer,
            chunks,
            skills,
            attached_document_ids,
        )

    # --- skills (027-skills) -------------------------------------------------

    async def create_skill(self, name: str, description: str, body: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._create_skill_sync, name, description, body)

    async def list_skills(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_skills_sync)

    async def get_skill(self, skill_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_skill_sync, skill_id)

    async def get_skill_by_name(self, name: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_skill_by_name_sync, name)

    async def update_skill(
        self, skill_id: str, name: str, description: str, body: str
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._update_skill_sync, skill_id, name, description, body)

    async def delete_skill(self, skill_id: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._delete_skill_sync, skill_id)

    async def read_history(self, session_id: str, limit: int = 5) -> dict[str, Any]:
        return await asyncio.to_thread(self._read_history_sync, session_id, limit)

    async def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_messages_sync, session_id)

    async def add_document(
        self, session_id: str, document_id: str, filename: str, chunk_count: int
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._add_document_sync, session_id, document_id, filename, chunk_count
        )

    async def list_documents(self, session_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_documents_sync, session_id)

    async def delete_document(self, session_id: str, document_id: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._delete_document_sync, session_id, document_id)


@lru_cache
def get_store() -> ConversationStore:
    return ConversationStore(get_settings().app_db_path_abs)
