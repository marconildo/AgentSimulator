# Tasks: Persist traces

> Schema + plumbing change. Order = TDD; each implementation task is
> preceded by the failing test. Hard prerequisite: 046 + 047 done +
> green (the audit/clear-coverage guard tests pin both
> `EXPECTED_TABLES` and `EXPECTED_CLEAR_KEYS`, which this spec
> extends).

## Tasks

### Pre-flight

- [ ] **T0 — verify 046 + 047 are done + green.** Run
      `pytest -q backend/tests/test_schema_audit.py
      backend/tests/test_clear_coverage.py
      backend/tests/test_schema_integrity.py`. All three files
      must exist and pass before starting 048.

### Schema + migration (AC1, AC2, AC3, AC4)

- [ ] **T1 — test first** (in a new
      `backend/tests/test_persist_traces.py`):
      `test_trace_events_table_has_expected_columns` (AC1). Open a
      fresh store, run `PRAGMA table_info(trace_events)`; assert the
      column names + types + NOT NULL flags match the spec.
      → **red** (table doesn't exist yet).
- [ ] **T2 — test first**: `test_trace_events_session_index_exists`
      (AC2). `PRAGMA index_list(trace_events)` includes
      `idx_trace_events_session`.
      → **red**.
- [ ] **T3 — test first**: `test_user_version_bumps_to_3_idempotently`
      (AC3). Build a v2 DB (raw `sqlite3.connect`, write the post-047
      schema *without* `trace_events`, `PRAGMA user_version = 2`),
      open as `ConversationStore`, assert version is 3 + table
      exists; re-open, assert still 3, no double-create.
      → **red**.
- [ ] **T4 — test first**: extend
      `backend/tests/test_schema_audit.py`: add `"trace_events"` to
      `EXPECTED_TABLES`. (AC4)
      → **red** (live DB doesn't have the table yet).
- [ ] **T5 — test first**: extend
      `backend/tests/test_clear_coverage.py`: add
      `"trace_events_deleted"` to `EXPECTED_CLEAR_KEYS`; in
      `_seed_one_of_everything`, also `INSERT INTO trace_events …`
      one row so AC6's empty-after-clear check exercises it; in
      `test_clear_all_zeroes_every_user_data_table` add
      `assert _count_rows(path, "trace_events") == 0` after the
      clear. (AC4 + AC12)
      → **red**.
- [ ] **T6 — implement**: in `backend/app/db/store.py`:
      - Add the `trace_events` CREATE TABLE + index to `_SCHEMA`.
      - Add `_SCHEMA_VERSION_PERSIST_TRACES = 3` constant.
      - Add `_migrate_to_persist_traces(path)` staticmethod
        (pattern from 047 but additive only — open conn → check
        `user_version` → `CREATE TABLE IF NOT EXISTS …` → `CREATE
        INDEX IF NOT EXISTS …` → set `user_version = 3` → close).
      - In `__init__`, call the new migration after
        `_migrate_to_integrity_constraints`.
      T1–T5 turn **green** (audit constants now match the live DDL).

### Write path (AC5, AC6, AC7, AC8)

- [ ] **T7 — test first**: `test_emit_persists_one_row` (AC5).
      Construct a `TraceEmitter` wired to a fresh
      `ConversationStore`; `await emitter.emit(Stage.RAG_SEARCH, …)`
      three times; assert `SELECT COUNT(*) FROM trace_events WHERE
      trace_id = ?` is 3 and the rows are ordered by `seq`.
      → **red** (emit doesn't write to DB yet).
- [ ] **T8 — test first**:
      `test_emit_persists_non_json_serializable_data_via_default_str`
      (AC6). Emit with `data={"path": Path("/tmp/x"), "lst": [1, 2]}`;
      no exception; SELECT the row; `json.loads(data)["path"]` is a
      string starting with `/tmp/`; the list survives as a list.
      → **red**.
- [ ] **T9 — test first**: `test_emit_pins_session_id_on_each_row`
      (AC7). Set `emitter.session_id = "s1"`; emit twice; both rows
      have `session_id = "s1"`. Then set
      `emitter.session_id = None`; emit once; that row has NULL.
      → **red**.
- [ ] **T10 — test first**: `test_emit_failure_does_not_propagate_to_caller`
      (AC8). Monkeypatch `_write_trace_event_sync` to raise
      `sqlite3.OperationalError`; call `emitter.emit(...)`; the
      coroutine resolves cleanly; the event still landed on
      `emitter.events` and `emitter.queue`. (Use a captured log
      handler to assert the warning was emitted, optional.)
      → **red**.
- [ ] **T11 — implement** (store):
      - `_write_trace_event_sync(self, event_dict)` —
        `INSERT INTO trace_events …` with
        `json.dumps(event_dict["data"] or {}, default=str)`.
      - Async wrapper `write_trace_event(event_dict)` via
        `asyncio.to_thread`.
- [ ] **T12 — implement** (emitter): in `trace.py`:
      - `TraceEmitter.__init__` accepts `session_id: str | None = None`
        and `on_event: Callable[[TraceEvent], Awaitable[None]] | None
        = None`.
      - New `async def _persist(self, event)` — calls
        `self._on_event(event)` if set, else falls back to
        `get_store().write_trace_event(self._row(event))`.
        Wraps the call in `try/except Exception` →
        `logging.getLogger(__name__).warning(...)` + swallow.
      - `_row(event)` builds the dict
        `{trace_id, seq, ts, session_id: self.session_id, stage,
        phase, label, data, metrics}`.
      - `emit()` does `await self._persist(event)` between the
        list-append and the queue-put.
      T7–T10 turn **green**.

### Read path (AC9, AC10, AC11)

- [ ] **T13 — test first**:
      `test_get_trace_endpoint_uses_memory_when_present` (AC9).
      `TestClient` flow: send (mock) a trace into `trace_store`
      directly; GET `/api/trace/{id}`; assert the returned shape
      matches the in-memory summary AND no DB read happened
      (monkeypatch a sentinel on `get_trace_summary` and assert
      it was not called).
      → likely **green** already (regression guard).
- [ ] **T14 — test first**: `test_get_trace_endpoint_falls_back_to_db`
      (AC10). Seed `trace_events` rows + a matching `messages` row
      via the store; ensure the in-memory `trace_store` does NOT
      have the id; `GET /api/trace/{id}`; assert the returned
      summary has the same shape: `trace_id`, `message`, `answer`,
      `events` ordered by `seq`.
      → **red**.
- [ ] **T15 — test first**: `test_get_trace_endpoint_404_on_unknown_id`
      (AC11). Neither memory nor DB has the id; GET → 404.
      → **green** today (regression guard).
- [ ] **T16 — implement** (store):
      - `_get_trace_events_sync(trace_id)` — `SELECT * FROM
        trace_events WHERE trace_id = ? ORDER BY seq ASC`. Return
        a list of dicts shaped like `TraceEvent`.
      - `_get_trace_summary_sync(trace_id)` — join with `messages`:
        `SELECT m.message, m.answer FROM messages m WHERE m.id = ?`
        (fall back to `("", "")` when no message row, so a
        before-persist trace still reads). Combine with events;
        return `None` if events list is empty AND no message row.
      - Async wrappers `get_trace_events` + `get_trace_summary`.
- [ ] **T17 — implement** (main): rewrite `GET /api/trace/{id}` —
      `trace_store.get(id) or await get_store().get_trace_summary(id)`;
      404 if both miss. Wire `session_id` on the emitter right after
      `ensure_session` in the chat endpoint AND right after the
      session is known in the upload endpoint.
      T13–T15 turn **green**.

### Cleanup (AC12, AC13)

- [ ] **T18 — test first**:
      `test_clear_all_zeroes_trace_events_and_reports_count` (AC12).
      Seed N rows; call `clear_all`; assert the returned dict has
      `trace_events_deleted == N` and the table is empty.
      → **red** (clear_all doesn't know about the table yet).
- [ ] **T19 — test first**:
      `test_delete_session_cascades_to_trace_events` (AC13). Create
      session S; seed two `trace_events` rows pointing at S; call
      `delete_session(S)`; assert both rows are gone.
      → **red** initially? Actually **green** once T6 lands (the
      FK CASCADE handles it for free) — keep as a regression guard.
- [ ] **T20 — implement**: extend `_clear_all_sync`:
      - Add `"trace_events_deleted":
        conn.execute("SELECT COUNT(*) ...")` to `counts`.
      - Add `conn.execute("DELETE FROM trace_events")` to the
        delete block (before `DELETE FROM sessions` so the CASCADE
        doesn't conflate counts).
      T18 turns **green**.

### End-to-end + docs (AC5 e2e, AC15)

- [ ] **T21 — test first** (`@pytest.mark.openai`):
      `test_chat_run_persists_full_trace`. Send a real
      `/api/chat`; collect the trace_id from the `done` event;
      clear `trace_store._traces` in-memory; `GET /api/trace/{id}`;
      assert the returned summary has ≥ N events (where N is the
      expected stage count for the simple scenario). Skipped
      without an OpenAI key.
      → **red** until everything is wired.
- [ ] **T22 — implement docs**: update `docs/data-model.md`:
      - ERD: add `trace_events` node with FK to `sessions`.
      - Tables section: add `trace_events` between `documents` and
        `message_documents`, listing every column + meaning +
        indices.
      - "What's NOT a table" — remove the line that said traces
        live only in memory; replace with: "Traces are persisted
        in the `trace_events` table; the in-memory `TraceStore`
        (`backend/app/trace.py`) is a bounded LRU=50 cache layered
        over the DB for cheap live reads."
      - "How `clear_all` wipes everything" — add `trace_events`
        first in the DELETE order and `trace_events_deleted` in
        the count keyset.
      - "Schema migrations history" — add `3 = post-048
        (`trace_events` table added; additive migration, no
        rebuild)`.

### Quality gate (AC14)

- [ ] **T23 — gate**: full `ruff check backend/` clean,
      `ruff format backend/` no-op,
      `pytest -q` green end-to-end (with `OPENAI_API_KEY`).
- [ ] **T24 — gate**: `npm run build` clean (no FE change expected;
      tsc + vite stay green).
- [ ] **T25 — memory + status**: update `MEMORY.md` pointer for
      spec 048 to "DONE & green" with the test counts; flip spec's
      `Status` to `done`.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
      (AC1–AC13) or a CI gate (AC14, AC15).
- [ ] `ruff check .` clean.
- [ ] `pytest -q` green (full suite, with `OPENAI_API_KEY`).
- [ ] `npm run build` clean (no FE change).
- [ ] 046's audit + clear-coverage tests still green WITH the
      `EXPECTED_TABLES` + `EXPECTED_CLEAR_KEYS` updates.
- [ ] `docs/data-model.md` updated (table section, ERD, cascade
      rules, clear_all order, migrations history).
- [ ] Protocol mirror unchanged (no `Stage` / `TraceEvent` shape
      change; `schemas.py` ↔ `events.ts` untouched).
- [ ] No new user-facing text.
- [ ] `spec.md` status updated to `done`.
- [ ] `MEMORY.md` pointer for 048 updated to reflect completion.
