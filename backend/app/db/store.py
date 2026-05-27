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

from ..config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    title      TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
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

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        # FK constraints are off by default in SQLite; enable per connection so
        # deleting a session cascades to its messages and documents.
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    # --- sessions ------------------------------------------------------------

    def _create_session_sync(self, session_id: str | None, title: str | None) -> dict[str, Any]:
        sid = session_id or uuid.uuid4().hex
        now = time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (sid, title, now, now),
            )
        return {"id": sid, "title": title, "created_at": now, "updated_at": now}

    def _ensure_session_sync(self, session_id: str) -> dict[str, Any]:
        existing = self._get_session_sync(session_id)
        if existing is not None:
            return existing
        return self._create_session_sync(session_id, None)

    def _get_session_sync(self, session_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
        return dict(row) if row else None

    def _list_sessions_sync(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT s.id, s.title, s.created_at, s.updated_at,
                       (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
                FROM sessions s
                ORDER BY s.updated_at DESC, s.created_at DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def _delete_session_sync(self, session_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        # Embeddings are intentionally left in the vector store (D6); only the
        # relational rows (and, by FK cascade, this session's messages/documents)
        # are removed here.
        return {"deleted": cur.rowcount > 0, "session_id": session_id}

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
            }
            conn.execute("DELETE FROM documents")
            conn.execute("DELETE FROM messages")
            conn.execute("DELETE FROM sessions")
            conn.execute("DELETE FROM skills")
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
        return [
            {
                "id": r["id"],
                "message": r["message"],
                "answer": r["answer"],
                "chunks": json.loads(r["chunks"] or "[]"),
                # 027-skills: the skill names applied to this turn (badge source).
                "skills": json.loads(r["skills"] or "[]"),
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
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._write_message_sync, session_id, message_id, message, answer, chunks, skills
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
