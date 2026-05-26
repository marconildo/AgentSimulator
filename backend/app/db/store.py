"""The application's relational database (its system of record).

A small, **real** SQLite-backed store — not a mock. It exists so the simulator
can show a genuine relational database next to the RAG vector store: the
backend loads recent history (a read) and persists every conversation (a
write). SQLite maps to a managed SQL service in production (Azure SQL,
Amazon RDS/Aurora, Cloud SQL).

This is deliberately separate from ``app/rag`` (the *vector* store): one holds
transactional app state, the other holds embeddings for retrieval — two
different databases for two different jobs, exactly as in a real deployment.

Queries run in a worker thread so SQLite's blocking calls never stall the
async event loop.
"""

from __future__ import annotations

import asyncio
import sqlite3
from functools import lru_cache
from pathlib import Path
from time import time
from typing import Any

from ..config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    message    TEXT NOT NULL,
    answer     TEXT NOT NULL,
    created_at REAL NOT NULL
)
"""


class ConversationStore:
    """Persists conversations to SQLite, one row per request."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    # --- sync bodies (run off the event loop) --------------------------------

    def _read_history_sync(self, limit: int) -> dict[str, Any]:
        with self._connect() as conn:
            total = conn.execute("SELECT COUNT(*) AS n FROM conversations").fetchone()["n"]
            rows = conn.execute(
                "SELECT message, answer FROM conversations ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        # Oldest-first so it reads naturally as a conversation transcript.
        recent = [{"message": r["message"], "answer": r["answer"]} for r in reversed(rows)]
        return {
            "table": "conversations",
            "engine": "sqlite",
            "total_rows": int(total),
            "recent": recent,
        }

    def _write_sync(self, trace_id: str, message: str, answer: str) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO conversations (id, message, answer, created_at) "
                "VALUES (?, ?, ?, ?)",
                (trace_id, message, answer, time()),
            )
            total = conn.execute("SELECT COUNT(*) AS n FROM conversations").fetchone()["n"]
        return {
            "table": "conversations",
            "engine": "sqlite",
            "operation": "INSERT",
            "row_id": trace_id,
            "total_rows": int(total),
        }

    # --- async public API ----------------------------------------------------

    async def read_history(self, limit: int = 5) -> dict[str, Any]:
        return await asyncio.to_thread(self._read_history_sync, limit)

    async def write(self, trace_id: str, message: str, answer: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._write_sync, trace_id, message, answer)


@lru_cache
def get_store() -> ConversationStore:
    return ConversationStore(get_settings().app_db_path_abs)
