"""048-persist-traces — every ``TraceEvent`` lands in a real SQLite
table (``trace_events``), in real time, so a trace survives the
bounded in-memory ``TraceStore`` eviction and the server restart.

Most tests here are pure-SQLite + a hand-built ``TraceEmitter`` (no
real OpenAI). The one end-to-end test that asserts a real chat run
persists its full trace is marked ``@pytest.mark.openai`` and is
skipped without a key.

Cross-references (do not let them drift):
- ``backend/tests/test_schema_audit.py::EXPECTED_TABLES`` must include
  ``"trace_events"`` (046's contract).
- ``backend/tests/test_clear_coverage.py::EXPECTED_CLEAR_KEYS`` must
  include ``"trace_events_deleted"`` (046's contract).
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import uuid
from pathlib import Path
from time import time

import pytest
from fastapi.testclient import TestClient

from app.db.store import ConversationStore
from app.main import app
from app.schemas import Phase, Stage, TraceEvent, TraceSummary
from app.trace import TraceEmitter, trace_store

# --- Schema + migration ----------------------------------------------------


def test_trace_events_table_has_expected_columns(tmp_path):
    """AC1 — `trace_events` table exists with the documented schema."""
    path = tmp_path / "columns.sqlite3"
    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        rows = conn.execute("PRAGMA table_info(trace_events)").fetchall()
    by_name = {r[1]: r for r in rows}
    assert by_name, "trace_events table is missing"
    # name → (type, notnull, pk)
    expected = {
        "trace_id": ("TEXT", 1, 1),
        "seq": ("INTEGER", 1, 2),
        "ts": ("REAL", 1, 0),
        "session_id": ("TEXT", 0, 0),
        "stage": ("TEXT", 1, 0),
        "phase": ("TEXT", 1, 0),
        "label": ("TEXT", 1, 0),
        "data": ("TEXT", 1, 0),
        "metrics": ("TEXT", 1, 0),
    }
    for col, (typ, notnull, pk) in expected.items():
        assert col in by_name, f"trace_events.{col} missing"
        assert by_name[col][2].upper() == typ
        assert by_name[col][3] == notnull, f"NOT NULL flag on {col} is wrong"
        assert by_name[col][5] == pk, f"PK position on {col} is wrong"


def test_trace_events_session_index_exists(tmp_path):
    """AC2 — the per-session lookup index is in place."""
    path = tmp_path / "index.sqlite3"
    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        rows = conn.execute("PRAGMA index_list(trace_events)").fetchall()
    names = {r[1] for r in rows}
    assert "idx_trace_events_session" in names, f"expected idx_trace_events_session, got {names!r}"


def _make_pre_048_db(path: Path) -> None:
    """Write a post-047, pre-048 DB: every existing table at the new
    constraints, but no ``trace_events`` yet, ``PRAGMA user_version = 2``."""
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                system_prompt TEXT NOT NULL,
                agent_prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                enabled_tools TEXT NOT NULL DEFAULT '[]',
                is_default INTEGER NOT NULL DEFAULT 0
                           CHECK (is_default IN (0, 1)),
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX idx_agents_is_default ON agents(is_default);
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                answer TEXT NOT NULL,
                chunks TEXT NOT NULL DEFAULT '[]',
                skills TEXT NOT NULL DEFAULT '[]',
                created_at REAL NOT NULL
            );
            CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0
                            CHECK (chunk_count >= 0),
                created_at REAL NOT NULL
            );
            CREATE TABLE message_documents (
                message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                created_at REAL NOT NULL,
                PRIMARY KEY (message_id, document_id)
            );
            CREATE TABLE skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX idx_messages_session ON messages(session_id, created_at);
            CREATE INDEX idx_documents_session ON documents(session_id, created_at);
            CREATE INDEX idx_message_documents_message  ON message_documents(message_id);
            CREATE INDEX idx_message_documents_document ON message_documents(document_id);
            """
        )
        now = time()
        conn.execute(
            "INSERT INTO agents (id, name, description, system_prompt, agent_prompt, "
            "model, enabled_tools, is_default, created_at, updated_at) "
            "VALUES ('agent-simulator-default', 'Agent Simulator', '', 'g', 'a', "
            "'gpt-4o-mini', '[]', 1, ?, ?)",
            (now, now),
        )
        conn.execute("PRAGMA user_version = 2")


def test_user_version_bumps_to_3_idempotently(tmp_path):
    """AC3 — a v2 DB migrates to v3 once; subsequent opens are no-ops."""
    path = tmp_path / "v3.sqlite3"
    _make_pre_048_db(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2

    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
        # The new table exists.
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='trace_events'"
        ).fetchall()
        assert rows, "trace_events should exist after migration"

    # Re-init: still v3, no double-create errors.
    ConversationStore(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3


# --- Write path ------------------------------------------------------------


def _emitter_wired_to(store: ConversationStore, trace_id: str, message: str) -> TraceEmitter:
    """Build an emitter whose persist hook points at ``store`` instead of
    the module-global ``get_store()``. Lets each unit test use its own
    isolated SQLite file via ``tmp_path``."""

    async def on_event(event: TraceEvent, session_id: str | None) -> None:
        await store.write_trace_event(
            {
                "trace_id": event.trace_id,
                "seq": event.seq,
                "ts": event.ts,
                "session_id": session_id,
                "stage": event.stage.value,
                "phase": event.phase.value,
                "label": event.label,
                "data": event.data,
                "metrics": event.metrics,
            }
        )

    return TraceEmitter(trace_id, message, on_event=on_event)


async def test_emit_persists_one_row(tmp_path):
    """AC5 — every emit lands one row in trace_events."""
    path = tmp_path / "emit.sqlite3"
    store = ConversationStore(path)
    session = await store.create_session()
    trace_id = uuid.uuid4().hex
    emitter = _emitter_wired_to(store, trace_id, "hello")
    emitter.session_id = session["id"]

    await emitter.emit(Stage.BACKEND, phase=Phase.START)
    await emitter.emit(Stage.RAG_SEARCH, phase=Phase.END, metrics={"latency_ms": 12.3})
    await emitter.emit(Stage.BACKEND, phase=Phase.END)

    with sqlite3.connect(path) as conn:
        rows = conn.execute(
            "SELECT seq, stage, phase FROM trace_events WHERE trace_id = ? ORDER BY seq",
            (trace_id,),
        ).fetchall()
    assert [r[0] for r in rows] == [1, 2, 3]
    assert rows[0][1] == Stage.BACKEND.value
    assert rows[1][1] == Stage.RAG_SEARCH.value
    assert rows[2][2] == Phase.END.value


async def test_emit_persists_non_json_serializable_data_via_default_str(tmp_path):
    """AC6 — data with a Path coerces to string via json.dumps(default=str)."""
    path = tmp_path / "json.sqlite3"
    store = ConversationStore(path)
    session = await store.create_session()
    emitter = _emitter_wired_to(store, uuid.uuid4().hex, "hello")
    emitter.session_id = session["id"]

    await emitter.emit(
        Stage.RAG_SEARCH,
        data={"path": Path("/tmp/x"), "lst": [1, 2, 3], "nested": {"a": 1}},
    )

    with sqlite3.connect(path) as conn:
        row = conn.execute(
            "SELECT data FROM trace_events WHERE trace_id = ?", (emitter.trace_id,)
        ).fetchone()
    parsed = json.loads(row[0])
    assert isinstance(parsed["path"], str) and parsed["path"].endswith("/tmp/x")
    assert parsed["lst"] == [1, 2, 3]
    assert parsed["nested"] == {"a": 1}


async def test_emit_pins_session_id_on_each_row(tmp_path):
    """AC7 — session_id is denormalized onto every row (and NULL is allowed)."""
    path = tmp_path / "sid.sqlite3"
    store = ConversationStore(path)
    s1 = (await store.create_session())["id"]
    emitter = _emitter_wired_to(store, uuid.uuid4().hex, "x")
    # Pre-session-adoption emit lands as NULL.
    await emitter.emit(Stage.BACKEND, phase=Phase.START)
    emitter.session_id = s1
    await emitter.emit(Stage.RAG_SEARCH)
    await emitter.emit(Stage.RAG_SEARCH, phase=Phase.END)

    with sqlite3.connect(path) as conn:
        rows = conn.execute(
            "SELECT seq, session_id FROM trace_events WHERE trace_id = ? ORDER BY seq",
            (emitter.trace_id,),
        ).fetchall()
    assert rows[0][1] is None
    assert rows[1][1] == s1
    assert rows[2][1] == s1


async def test_emit_failure_does_not_propagate_to_caller(tmp_path, monkeypatch, caplog):
    """AC8 — a DB write that raises is logged + swallowed; the in-memory
    event still reaches `self.queue` so SSE keeps streaming."""
    import logging

    from app.db import store as store_module

    path = tmp_path / "fail.sqlite3"
    ConversationStore(path)  # triggers schema

    def boom(self, event_dict):
        raise sqlite3.OperationalError("disk fell off the rack")

    monkeypatch.setattr(store_module.ConversationStore, "_write_trace_event_sync", boom)

    emitter = TraceEmitter(uuid.uuid4().hex, "hello")
    with caplog.at_level(logging.WARNING):
        ev = await emitter.emit(Stage.RAG_SEARCH)

    # The emit returned cleanly and the in-memory event is intact.
    assert ev.stage == Stage.RAG_SEARCH
    assert emitter.events[-1].stage == Stage.RAG_SEARCH
    assert emitter.queue.qsize() == 1
    # And the failure is observable in logs.
    assert any("trace_event" in r.message or "disk fell off" in r.message for r in caplog.records)


# --- Read path -------------------------------------------------------------


def _seed_trace_in_db_and_memory(store: ConversationStore, *, in_memory: bool):
    """Helper for AC10: write a small trace (3 events) to the DB + a
    matching `messages` row so the fallback's join finds both halves.
    Returns (trace_id, session_id).
    """
    sid = asyncio.run(store.create_session())["id"]
    trace_id = uuid.uuid4().hex
    # Match the chat endpoint's invariant: message_id == trace_id.
    asyncio.run(store.write_message(sid, trace_id, "what time is it?", "The time is 2pm."))
    # Three trace_events via the store's async wrapper.
    base_ts = time()
    for i, stage in enumerate([Stage.BACKEND, Stage.RAG_SEARCH, Stage.LLM_GENERATE], start=1):
        asyncio.run(
            store.write_trace_event(
                {
                    "trace_id": trace_id,
                    "seq": i,
                    "ts": base_ts + i * 0.01,
                    "session_id": sid,
                    "stage": stage.value,
                    "phase": Phase.END.value,
                    "label": f"step-{i}",
                    "data": {"i": i},
                    "metrics": {"latency_ms": float(i)},
                }
            )
        )

    if in_memory:
        # Build a fake emitter and stash its summary so the memory hit fires.
        e = TraceEmitter(trace_id, "what time is it?")
        e.answer = "The time is 2pm."
        # The in-memory summary intentionally carries no events here; the
        # AC9 contract is "memory wins when present" — the test checks the
        # endpoint returns the memory shape, not the DB one.
        trace_store.save(e)
    else:
        # AC10 path: simulate restart by removing the in-memory entry.
        trace_store._traces.pop(trace_id, None)  # noqa: SLF001 - intentional test reach-in
    return trace_id, sid


def test_get_trace_endpoint_uses_memory_when_present(monkeypatch):
    """AC9 — memory hit serves the in-memory summary; no DB read happens."""
    from app.db import store as store_module

    called = []
    original = store_module.ConversationStore._get_trace_summary_sync

    def spy(self, trace_id):
        called.append(trace_id)
        return original(self, trace_id)

    monkeypatch.setattr(store_module.ConversationStore, "_get_trace_summary_sync", spy)

    with TestClient(app) as client:
        store = store_module.get_store()
        trace_id, _ = _seed_trace_in_db_and_memory(store, in_memory=True)
        resp = client.get(f"/api/trace/{trace_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["trace_id"] == trace_id
    assert called == [], "DB fallback should NOT fire when memory has the trace"


def test_get_trace_endpoint_falls_back_to_db():
    """AC10 — when memory has been evicted, the DB rebuilds the summary."""
    from app.db.store import get_store

    with TestClient(app) as client:
        store = get_store()
        trace_id, _ = _seed_trace_in_db_and_memory(store, in_memory=False)
        resp = client.get(f"/api/trace/{trace_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["trace_id"] == trace_id
    assert body["message"] == "what time is it?"
    assert body["answer"] == "The time is 2pm."
    # Three events back, ordered by seq.
    assert [e["seq"] for e in body["events"]] == [1, 2, 3]
    assert body["events"][0]["stage"] == Stage.BACKEND.value
    # JSON fields decoded to dicts.
    assert body["events"][0]["data"] == {"i": 1}
    assert body["events"][0]["metrics"] == {"latency_ms": 1.0}
    # Reading round-trips through Pydantic TraceSummary cleanly.
    TraceSummary.model_validate(body)


def test_get_trace_endpoint_404_on_unknown_id():
    """AC11 — unknown trace_id is still 404 (no false 200s)."""
    with TestClient(app) as client:
        resp = client.get(f"/api/trace/{uuid.uuid4().hex}")
    assert resp.status_code == 404


# --- Cleanup ---------------------------------------------------------------


async def test_clear_all_zeroes_trace_events_and_reports_count(tmp_path):
    """AC12 — clear_all wipes trace_events and reports the count."""
    path = tmp_path / "wipe.sqlite3"
    store = ConversationStore(path)
    sid = (await store.create_session())["id"]
    tid = uuid.uuid4().hex
    for i in range(3):
        await store.write_trace_event(
            {
                "trace_id": tid,
                "seq": i + 1,
                "ts": float(i),
                "session_id": sid,
                "stage": Stage.RAG_SEARCH.value,
                "phase": Phase.END.value,
                "label": "",
                "data": {},
                "metrics": {},
            }
        )

    counts = await store.clear_all()
    assert counts.get("trace_events_deleted") == 3
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM trace_events").fetchone()[0] == 0


async def test_delete_session_cascades_to_trace_events(tmp_path):
    """AC13 — deleting a session cascades to its trace_events rows."""
    path = tmp_path / "cascade.sqlite3"
    store = ConversationStore(path)
    sid = (await store.create_session())["id"]
    other_sid = (await store.create_session())["id"]
    tid = uuid.uuid4().hex
    other_tid = uuid.uuid4().hex
    for i in range(2):
        await store.write_trace_event(
            {
                "trace_id": tid,
                "seq": i + 1,
                "ts": float(i),
                "session_id": sid,
                "stage": Stage.BACKEND.value,
                "phase": Phase.END.value,
                "label": "",
                "data": {},
                "metrics": {},
            }
        )
    await store.write_trace_event(
        {
            "trace_id": other_tid,
            "seq": 1,
            "ts": 0.0,
            "session_id": other_sid,
            "stage": Stage.BACKEND.value,
            "phase": Phase.END.value,
            "label": "",
            "data": {},
            "metrics": {},
        }
    )

    await store.delete_session(sid)

    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        rows = conn.execute("SELECT trace_id FROM trace_events ORDER BY trace_id").fetchall()
    # The other session's row survives; ours is gone.
    assert [r[0] for r in rows] == [other_tid]


# --- End-to-end (real OpenAI) ---------------------------------------------


@pytest.mark.openai
def test_chat_run_persists_full_trace():
    """AC5 (end-to-end) + AC10 — a real chat run leaves the full trace in
    the DB; clearing the in-memory store and re-reading via the endpoint
    still returns the events."""
    with TestClient(app) as client:
        # Use the non-streaming `batch` mode so we synchronously get the trace_id.
        resp = client.post(
            "/api/chat",
            json={"message": "What is RAG?", "mode": "batch"},
        )
        assert resp.status_code == 200
        body = resp.json()
        trace_id = body["trace_id"]

        # Confirm rows actually landed in the DB.
        from app.db.store import get_store

        events = asyncio.run(get_store().get_trace_events(trace_id))
        assert len(events) >= 3, f"expected ≥3 trace events, got {len(events)}"

        # Simulate restart: drop the in-memory copy.
        trace_store._traces.pop(trace_id, None)  # noqa: SLF001

        replay = client.get(f"/api/trace/{trace_id}")
    assert replay.status_code == 200
    summary = replay.json()
    assert summary["trace_id"] == trace_id
    assert len(summary["events"]) >= 3
