# Plan: Persist traces

> Single new table, one write hook, one read fallback. No protocol
> change. Builds directly on top of 046 (audit guard) and 047
> (`user_version`-gated migration pattern).

## Approach

The visualizer already has all the moving parts: `TraceEmitter.emit`
collects events into an in-memory list, pushes them onto the SSE queue,
and `trace_store.save(emitter)` snapshots the full summary at run end.
We splice in a DB write between the in-memory append and the queue push,
so every event is durable before any consumer sees it.

Three concrete moves:

1. **New table `trace_events`** (single denormalized table — see
   spec). Added to `_SCHEMA` for fresh DBs and via a new
   `_migrate_to_persist_traces(path)` for existing DBs (pattern copied
   from 047's `_migrate_to_integrity_constraints`, but additive only —
   no table rebuild). Gated by `PRAGMA user_version`, bumps 2 → 3.
2. **`TraceEmitter.emit` writes one row per event.** A new
   `await asyncio.to_thread(self._on_event, event)` between the
   list-append and the queue-put. The default `_on_event` is provided
   at construction time by `main.py` (a closure over `get_store()` and
   the resolved `session_id`). Tests substitute their own. Failures
   are caught + logged but never propagate — SSE never stalls on a DB
   hiccup.
3. **`GET /api/trace/{id}` layered read.** Returns `trace_store.get(id)`
   when present; otherwise calls `get_store().get_trace_summary(id)`
   which joins `messages` (for `message`/`answer`) with `trace_events`
   (for the event list). Same `TraceSummary` shape on the wire.

Alternatives considered + rejected:
- **`asyncio.create_task` (fire-and-forget).** Faster, but the run can
  finish before the writes drain, so AC5 (row count == event count)
  becomes flaky. Per-emit `await asyncio.to_thread` keeps the test
  contract tight and the perf cost negligible (~1ms × ~30 events).
- **Background queue.** More code (lifespan task, drain on shutdown,
  backpressure) for no real benefit in a single-instance app.
- **Header `traces` table.** Derived views cover the use cases (latest
  trace per session, event count) without a second table. Folded into
  spec's non-goals.

## Affected files

**Backend code**
- `backend/app/db/store.py`:
  - `_SCHEMA` — add `CREATE TABLE IF NOT EXISTS trace_events …` +
    `CREATE INDEX IF NOT EXISTS idx_trace_events_session …`.
  - `_SCHEMA_VERSION_PERSIST_TRACES = 3` constant.
  - `_migrate_to_persist_traces(path)` staticmethod — opens its own
    connection (no transaction trickery needed; pure additive
    `CREATE TABLE IF NOT EXISTS`), runs only when `user_version < 3`,
    bumps to 3.
  - `__init__` — call the new migration after
    `_migrate_to_integrity_constraints`.
  - New `_write_trace_event_sync(event_dict)` + `write_trace_event`
    async wrapper.
  - New `_get_trace_events_sync(trace_id)` + `get_trace_events` async
    wrapper (returns `list[dict]` ready to materialise into
    `TraceEvent` objects).
  - New `_get_trace_summary_sync(trace_id)` + `get_trace_summary`
    async wrapper: joins with `messages` for `message`/`answer`;
    returns `None` if neither side has rows.
  - `_clear_all_sync` — DELETE the new table, add
    `trace_events_deleted` to the counts dict.
- `backend/app/trace.py`:
  - `TraceEmitter.__init__` accepts `session_id: str | None = None`
    and `on_event: Callable[[TraceEvent], Awaitable[None]] | None =
    None`. `session_id` may also be set post-construction
    (`emitter.session_id = sid`).
  - `emit()` calls `await self._persist(event)` between the list
    append and the queue put. `_persist` defaults to the `on_event`
    closure or `get_store().write_trace_event(...)` if a closure
    wasn't supplied.
  - Persist failure logged via `logging.getLogger(__name__).warning`
    and swallowed.
- `backend/app/main.py`:
  - In the chat endpoint, after `session = await store.ensure_session(...)`,
    set `emitter.session_id = session_id`.
  - In the upload endpoint, same setter right after the session is
    known.
  - `GET /api/trace/{id}` — fall back to `get_store().get_trace_summary(id)`
    on memory miss; 404 only if both miss.

**Backend tests (new)**
- `backend/tests/test_persist_traces.py` — covers AC1, AC2, AC3, AC5,
  AC6, AC7, AC8, AC10, AC11, AC13. Pure SQLite + a fake emitter (no
  real OpenAI needed). The `[openai]`-marked end-to-end test (AC5
  end-to-end via a real chat) lives here and is skipped without a key.

**Backend tests (touch)**
- `backend/tests/test_schema_audit.py` — `EXPECTED_TABLES` adds
  `"trace_events"`. (AC4)
- `backend/tests/test_clear_coverage.py` — `EXPECTED_CLEAR_KEYS` adds
  `"trace_events_deleted"`; the coverage test seeds a `trace_events`
  row in its fixture and asserts `COUNT(*) == 0` after. (AC4 + AC12)

**Documentation (touch)**
- `docs/data-model.md`:
  - Add `trace_events` to the ERD.
  - Add a new `trace_events` section under "Tables" (columns + meaning
    + indices).
  - Update "What's NOT a table" — remove the line that said traces
    were in memory; replace with a note that the in-memory
    `TraceStore` (`backend/app/trace.py`) is still there as a
    bounded cache, layered over the DB.
  - Update "How `clear_all` wipes everything" with the new count key
    and DELETE ordering (trace_events first, then the rest).
  - Update the "Schema migrations history" list to add `3 = post-048`.
- `CLAUDE.md` — no change (docs/data-model.md is already linked).
- `MEMORY.md` — pointer added once the spec is DONE & green.

**Frontend**
- None.

## Protocol changes (constitution §1)

None. No `Stage`, no `Phase`, no `TraceEvent` shape change. The
`TraceSummary` JSON shape returned by `GET /api/trace/{id}` is
identical whether the source is memory or DB.

- `backend/app/schemas.py` — no change.
- `frontend/src/types/events.ts` — no change.

## Data model changes

| Table | Change |
|---|---|
| `trace_events` | **NEW** — denormalized event log (see schema below) |

```sql
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
```

`PRAGMA user_version`: 2 → 3 after the migration.

`message_id` is **deliberately not stored** — `trace_id == message_id`
by construction (the chat endpoint reuses `trace_id` when calling
`write_message` at the end of the run). The DB-fallback read joins
`trace_events.trace_id = messages.id`.

`session_id` is nullable so that emitters constructed before session
adoption (a brief construction-time window in `main.py`) can still
write their early events. The chat / upload endpoints set
`emitter.session_id` as soon as the session is known.

## i18n strings (constitution §4)

None. No user-facing prose.

| key / location | en | pt |
|---|---|---|
| — | — | — |

## Cloud map (constitution §5)

n/a — no new tier or station. The new table sits inside the same
relational store (mapped to Azure SQL / Cloud SQL / RDS in production
per the existing `app_db_path` documentation).

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 — trace_events table exists with documented columns | `test_trace_events_table_has_expected_columns` | `backend/tests/test_persist_traces.py` |
| AC2 — idx_trace_events_session index exists | `test_trace_events_session_index_exists` | same |
| AC3 — user_version bumps 2 → 3 idempotently on a pre-048 DB | `test_user_version_bumps_to_3_idempotently` | same |
| AC4 — 046 audit + clear-coverage tests are extended in lockstep | regression update in `test_schema_audit.py` + `test_clear_coverage.py` | (touch) |
| AC5 — every emit persists one row | `test_emit_persists_one_row` (fake emitter + direct count) + `test_chat_run_persists_full_trace` (`@pytest.mark.openai`, end-to-end) | `backend/tests/test_persist_traces.py` |
| AC6 — data/metrics round-trip as JSON (incl. non-JSON-serializable) | `test_emit_persists_non_json_serializable_data_via_default_str` | same |
| AC7 — session_id is denormalized correctly | `test_emit_pins_session_id_on_each_row` | same |
| AC8 — persist failures do not break SSE | `test_emit_failure_does_not_propagate_to_caller` | same |
| AC9 — memory hit serves from TraceStore (regression) | `test_get_trace_endpoint_uses_memory_when_present` | same (uses TestClient) |
| AC10 — DB fallback reconstructs the summary | `test_get_trace_endpoint_falls_back_to_db` | same |
| AC11 — unknown trace_id is still 404 | `test_get_trace_endpoint_404_on_unknown_id` | same |
| AC12 — clear_all zeroes trace_events + reports count | `test_clear_all_zeroes_trace_events_and_reports_count` | same |
| AC13 — delete_session cascades to trace_events | `test_delete_session_cascades_to_trace_events` | same |
| AC14 — ruff + pytest + build green | CI gate |
| AC15 — docs/data-model.md updated | manual + 046 audit test pins the table name in the doc |

The end-to-end test (AC5 / AC10 combined) sends one real chat,
captures the trace_id, clears the in-memory `TraceStore`, then asserts
`GET /api/trace/{id}` still returns the full event list. Marked
`@pytest.mark.openai` so it skips without a key (keyless tests cover
the same paths with a fake emitter).

## Risks / trade-offs

- **Write amplification.** ~30 INSERTs per chat (one per emit). At
  ~1ms each on local SQLite + `asyncio.to_thread`, that's ~30ms of
  serial DB time — vanishing next to the model round-trip. If perf
  ever bites, a follow-up spec can switch to `executemany` batched at
  end of run.
- **Persist failures swallowed.** AC8's contract is "log + continue."
  If the DB truly disappears, the trace silently degrades to
  in-memory-only — which is exactly today's behavior. The
  alternative ("crash the run on DB failure") trades a worse UX for
  no observability gain.
- **`data` payloads may contain unusual objects.** `json.dumps` with
  `default=str` coerces e.g. `Path`, `bytes`, `datetime` into strings.
  Round-tripped values stay as strings (not their original types).
  Acceptable — tests assert structural shape, not type identity.
- **`session_id` nullable.** A few early-construction emits land with
  NULL. Acceptable — they're rare (e.g. `req.message` validation
  events) and the FE never filters by `session_id` on the trace API.
- **In-memory store still present.** Some readers will assume the DB
  is now the canonical source. It is — but the memory cache stays for
  live runs (the trace finishes faster than the DB write resolves to
  a queryable state). Keeps the existing happy path identical.
- **046's `EXPECTED_TABLES` + `EXPECTED_CLEAR_KEYS` shift in this
  PR.** That's the whole point of 046 — these change deliberately, in
  lockstep with `docs/data-model.md`. CI would have failed otherwise,
  which would have been the correct signal.
- **Cascade on session delete is per-connection.** `_connect` already
  sets `PRAGMA foreign_keys = ON` — the existing pattern carries the
  cascade for free.
- **Multi-connection migration.** Pattern copied from 047 (one
  dedicated connection for the migration). For 048 it's strictly
  additive (`CREATE TABLE IF NOT EXISTS`), so no FK toggling needed.
- **Test isolation.** The `get_store` `@lru_cache` already lets each
  pytest run share one DB inside the session; the 046 audit tests
  build their own throwaway store via `ConversationStore(tmp_path)`,
  so they're unaffected by the global store's accumulated state.
