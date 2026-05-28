"""The application's relational database (its system of record).

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
    agent_id   TEXT REFERENCES agents(id),
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
-- 043-persisted-agent: the agent is a real, SQLite-persisted entity. Each
-- conversation owns its own row (clone-on-create from the default row, which is
-- preserved across `clear_all` by re-seeding). Edits PATCH this row directly;
-- conversations are insulated from each other.
CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    agent_prompt  TEXT NOT NULL,
    model         TEXT NOT NULL,
    enabled_tools TEXT NOT NULL DEFAULT '[]', -- JSON list[str]; [] = no tools
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
    -- 027-skills: the skill names the agent loaded for this turn (JSON list),
    -- mirroring `chunks` so the "skills applied" badge survives reload/replay.
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


class ConversationStore:
    """Session-scoped conversation store backed by SQLite."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            self._migrate(conn)

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
        # 042-agent-anatomy initially added `sessions.agent_name` (a single
        # column). 043-persisted-agent supersedes that with the `agents` table
        # + `sessions.agent_id`. The migration steps below are each idempotent
        # so re-runs are no-ops:
        #   1. add `agent_id` column if missing
        #   2. seed the default agent row if missing (uses the GUARDRAILS +
        #      AGENT prompts and the configured model)
        #   3. backfill every session lacking an `agent_id` with a fresh
        #      clone of the default
        #   4. copy any non-null legacy `agent_name` into the clone's name
        #   5. drop the legacy `agent_name` column (SQLite 3.35+ DROP COLUMN)
        session_cols = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
        if "agent_id" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN agent_id TEXT REFERENCES agents(id)")

        # Steps 2–4 only run once the `agents` table exists (which it does
        # because the schema in _SCHEMA created it before _migrate was called).
        _seed_default_agent_sync(conn)
        ConversationStore._backfill_sessions_with_agents(conn)
        # Step 5 — drop the legacy column once data is safely in `agents.name`.
        session_cols = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
        if "agent_name" in session_cols:
            try:
                conn.execute("ALTER TABLE sessions DROP COLUMN agent_name")
            except sqlite3.OperationalError:
                # Older SQLite (< 3.35) can't drop columns; leave the column in
                # place. Reads ignore it; the new code never writes to it.
                pass

    @staticmethod
    def _backfill_sessions_with_agents(conn: sqlite3.Connection) -> None:
        """One-time migration: every existing session without an `agent_id`
        gets a fresh clone of the default agent. Idempotent — re-running is
        a no-op once every session has one.

        Carries the legacy `sessions.agent_name` (042) onto the clone's
        `agents.name` when present, so the user's prior name survives the
        schema swap.
        """
        # Detect the legacy column once; the second migration run won't have it.
        session_cols = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
        has_legacy_name = "agent_name" in session_cols
        select_cols = "id, agent_name" if has_legacy_name else "id, NULL AS agent_name"

        rows = conn.execute(f"SELECT {select_cols} FROM sessions WHERE agent_id IS NULL").fetchall()
        if not rows:
            return
        default = conn.execute("SELECT * FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
        if default is None:
            return  # _seed_default_agent_sync should have run first
        for row in rows:
            agent_id = uuid.uuid4().hex
            now = time()
            name = row["agent_name"] or default["name"]
            conn.execute(
                "INSERT INTO agents (id, name, description, system_prompt, "
                "agent_prompt, model, enabled_tools, is_default, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
                (
                    agent_id,
                    name,
                    default["description"],
                    default["system_prompt"],
                    default["agent_prompt"],
                    default["model"],
                    default["enabled_tools"],
                    now,
                    now,
                ),
            )
            conn.execute("UPDATE sessions SET agent_id = ? WHERE id = ?", (agent_id, row["id"]))

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        # FK constraints are off by default in SQLite; enable per connection so
        # deleting a session cascades to its messages and documents.
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    # --- sessions ------------------------------------------------------------

    def _create_session_sync(self, session_id: str | None, title: str | None) -> dict[str, Any]:
        """Create a session AND its cloned agent (043-persisted-agent).

        Each conversation owns its own agent row. We clone the seed default at
        creation time so edits in this conversation don't surprise others.
        """
        sid = session_id or uuid.uuid4().hex
        now = time()
        with self._connect() as conn:
            agent_id = self._clone_default_agent_sync(conn)
            conn.execute(
                "INSERT INTO sessions (id, title, agent_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (sid, title, agent_id, now, now),
            )
            agent_row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return {
            "id": sid,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "agent": _agent_row(agent_row) if agent_row else None,
        }

    @staticmethod
    def _clone_default_agent_sync(conn: sqlite3.Connection) -> str:
        """Insert a fresh, non-default agent row by cloning the seed default.
        Returns the new agent id. Re-seeds the default first if it was wiped
        (defense in depth — the lifespan + clear handler also seed it)."""
        _seed_default_agent_sync(conn)
        default = conn.execute("SELECT * FROM agents WHERE is_default = 1 LIMIT 1").fetchone()
        if default is None:
            raise RuntimeError("default agent missing — seeding failed")
        new_id = uuid.uuid4().hex
        now = time()
        conn.execute(
            "INSERT INTO agents (id, name, description, system_prompt, "
            "agent_prompt, model, enabled_tools, is_default, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
            (
                new_id,
                default["name"],
                default["description"],
                default["system_prompt"],
                default["agent_prompt"],
                default["model"],
                default["enabled_tools"],
                now,
                now,
            ),
        )
        return new_id

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
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
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
        """Delete a session + its cloned agent (043-persisted-agent).

        The seed default agent is preserved (the agent we delete here is the
        clone created in `_create_session_sync` — it carries `is_default=0`).
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT agent_id FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            if row is not None and row["agent_id"]:
                conn.execute(
                    "DELETE FROM agents WHERE id = ? AND is_default = 0",
                    (row["agent_id"],),
                )
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
            }
            conn.execute("DELETE FROM documents")
            conn.execute("DELETE FROM messages")
            conn.execute("DELETE FROM sessions")
            conn.execute("DELETE FROM skills")
            conn.execute("DELETE FROM agents")
            # Re-seed the default agent immediately so the next `create_session`
            # has something to clone (the lifespan seed only runs on startup).
            _seed_default_agent_sync(conn)
        return {k: int(v) for k, v in counts.items()}

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
            conn.execute(
                "INSERT OR REPLACE INTO messages "
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

    async def clear_all(self) -> dict[str, Any]:
        return await asyncio.to_thread(self._clear_all_sync)

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
