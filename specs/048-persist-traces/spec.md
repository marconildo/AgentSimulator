# Spec: Persist traces — a real SQLite store for every `TraceEvent`

| | |
|---|---|
| **ID** | 048-persist-traces |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> Promotes the in-memory `TraceStore` (`backend/app/trace.py`, LRU=50,
> dies on restart) to a real SQLite-backed log: every `TraceEvent`
> emitted during a chat or upload is persisted, in real time, so
> traces survive the server reboot and are accessible long after the
> bounded in-memory store evicts them. **No protocol change** — the
> on-the-wire `TraceEvent` shape is identical; this spec only adds a
> server-side `INSERT` next to the existing in-memory append + SSE
> push.

## Problem / motivation

The simulator emits a rich stream of `TraceEvent`s (one per stage
START/END plus PROGRESS), animated on the canvas live and replayable
afterwards via `GET /api/trace/{id}`. But the trace itself lives only in
a process-wide `TraceStore` capped at 50 traces — anything older is
evicted, and a server restart wipes the lot.

That's the design today (constitution §7: "single-instance by design")
and it works for the live demo. But three real friction points
surfaced:

1. **The trace expired UX.** Inspector / Execution-traces shows a
   "trace expired — no longer available" toast for any conversation
   older than ~50 turns or after a restart. The fix today is "talk to
   the agent again" — but the *answer* is still in `messages.answer`,
   and the user already saw the trace once; not being able to revisit
   it is jarring.
2. **No post-mortem.** When the user pushes a buggy prompt and wants
   to see *exactly* what happened in the agent (which RAG hits won,
   which tool calls fired, what prompt was assembled), the trace is
   the only artifact. Losing it on restart kills the visualizer's
   pedagogical promise ("everything is real, everything is
   inspectable").
3. **Mental-model gap.** The visualizer ships a real SQLite database
   next to the real Chroma vector store, and a real LangGraph loop —
   but the trace, the most observable artifact, lives in memory only.
   Persisting it brings the simulator closer to a real production
   observability stack (LangSmith, Helicone, …) the Advanced rung is
   trying to teach.

The fix is a single new table and a write hook on `emit`. Reads layer
over the existing in-memory store (memory first, DB fallback) so the
happy path stays cheap.

## Goals

- **One new table, `trace_events`** (denormalized, single-table) —
  every event a row, primary key `(trace_id, seq)`. No header row;
  `session_id` is denormalized on each row for fast per-session
  queries. `message_id` is not stored because `message_id == trace_id`
  by construction (the chat endpoint reuses `trace_id` as the message
  id when persisting at the end of the run).
- **Real-time write on every `emit`.** `TraceEmitter.emit` already
  does `self.events.append(event)` and `await self.queue.put(event)`;
  it gains a `await asyncio.to_thread(get_store()._write_trace_event_sync, …)`
  in between, so the event lands in SQLite **before** the SSE consumer
  sees it. Failure to persist (rare) is logged but does **not** stop
  the run — the in-memory event still goes to SSE.
- **`session_id` carried by the emitter.** `TraceEmitter` gains a
  `session_id: str | None` attribute, set right after the chat / upload
  endpoint adopts the session. Every subsequent emit pins it on the
  row. The constructor still works without it (early bootstrap +
  tests).
- **Reads fall through to DB.** `GET /api/trace/{id}` returns the
  in-memory `TraceSummary` when present; otherwise it reconstructs
  one from `trace_events` (+ `messages.message` / `messages.answer`
  for the header), returning the same shape. The "trace expired"
  UI message becomes unreachable in practice.
- **`clear_all` wipes traces too.** Folded into the existing reset
  flow (025-clear-databases): the `clear_all` return dict gains a
  `trace_events_deleted` count, and 046's `EXPECTED_TABLES` +
  `EXPECTED_CLEAR_KEYS` are extended accordingly. Single-session
  delete cascades via the FK (`session_id REFERENCES sessions(id) ON
  DELETE CASCADE`).
- **Migration: `PRAGMA user_version` 2 → 3.** A small additive
  migration: `CREATE TABLE IF NOT EXISTS trace_events …` plus its
  index. Idempotent, gated by the version pragma. No table rebuild
  (no existing rows to copy).
- **Constitution-aligned.** No new `Stage` / `Phase` / `TraceEvent`
  field (§1 protocol unchanged). The visualizer remains
  single-instance by design (§7); we're not building a distributed
  trace pipeline — we're persisting locally what was previously
  process-memory-only. Cloud map: the SQLite table maps to the same
  managed SQL service in production (Azure SQL, Cloud SQL, RDS)
  that backs sessions/messages/etc.

## Non-goals

- **A separate Python `logging` capture** (handler that writes
  `logger.info` to a DB row). The clarify decision was: trace events
  only — that's what the visualizer needs, and Python stdout/stderr
  is the host's responsibility.
- **A header table `traces` with status / started_at / finished_at**.
  Same clarify decision: denormalized single table. Derivable views
  (`SELECT trace_id, MIN(ts), MAX(ts) FROM trace_events GROUP BY trace_id`)
  cover the cases that motivated a header.
- **Bounded retention by count or age.** Clarify decision: unbounded;
  the user clears via `clear_all` (existing Settings → Clear
  databases). If retention becomes a problem in practice, a future
  spec 049 can add a sweeper.
- **A new HTTP listing endpoint** (`GET /api/traces?session_id=…`).
  Out of scope for 048; the current single-trace endpoint covers the
  replay path. Listing/filtering UX is a follow-up.
- **Background queue / batch commit.** Clarify decision: real-time
  per-emit. The overhead is ~1ms per event × ~30 events = ~30ms per
  chat, dwarfed by the model round-trip.
- **Backfilling traces from running clients.** Stale browser tabs
  with cached `loadedTraceId` for a now-evicted trace just work
  silently (DB fallback returns the data).
- **Frontend changes beyond what falls out for free.** No new store
  state, no new UI. The existing "trace expired" UI strings stay in
  the codebase (they're still technically reachable for traces from
  *another* instance, even if practically uncommon).

## User-facing behavior

- **Send a chat → see the trace as before.** No visible change. The
  canvas animates the live SSE stream; the DB write happens in the
  background of `emit`.
- **Reload the browser / restart the server / open a long-ago
  conversation → the trace still works.** Clicking a past message
  loads its trace from the DB; the canvas replays it. Previously
  this hit "trace expired".
- **Clear databases (Settings) → traces wipe too.** The existing
  "Clear databases" button now also reports a `trace_events_deleted`
  count. Same one-click reset; one more row in the count summary.
- **Delete a single conversation → its traces go too.** The FK
  cascade from `sessions.id` removes every `trace_events` row pointed
  at that session.

## Acceptance criteria

### Schema + migration

1. **AC1 — `trace_events` table exists** after store init with the
   documented columns: `trace_id TEXT NOT NULL`, `seq INTEGER NOT
   NULL`, `ts REAL NOT NULL`, `session_id TEXT REFERENCES sessions(id)
   ON DELETE CASCADE`, `stage TEXT NOT NULL`, `phase TEXT NOT NULL`,
   `label TEXT NOT NULL DEFAULT ''`, `data TEXT NOT NULL DEFAULT
   '{}'`, `metrics TEXT NOT NULL DEFAULT '{}'`, `PRIMARY KEY
   (trace_id, seq)`. Verified via `PRAGMA table_info(trace_events)`.

2. **AC2 — `idx_trace_events_session` index exists** on
   `(session_id, ts)` for the per-session lookup path. Verified via
   `PRAGMA index_list(trace_events)`.

3. **AC3 — `PRAGMA user_version` bumps 2 → 3 idempotently** on a
   pre-048 DB. Migration is gated by the version pragma: second boot
   is a no-op. Tested by manually seeding a v2 DB and asserting the
   table exists + version == 3 after open; subsequent opens stay at
   3.

4. **AC4 — 046's audit + clear-coverage tests are extended in
   lockstep.** `EXPECTED_TABLES` adds `"trace_events"`;
   `EXPECTED_CLEAR_KEYS` adds `"trace_events_deleted"`; the
   `test_clear_all_zeroes_every_user_data_table` test now also seeds
   a trace event and asserts the row is gone after `clear_all`. The
   diff-style failure message stays diff-style.

### Write path

5. **AC5 — Every `TraceEmitter.emit` persists one row.** A chat run
   that emits N events leaves exactly N rows in `trace_events`
   keyed by that `trace_id`. Verified end-to-end in a real (or
   mocked-pipeline) flow — and unit-tested by calling
   `await emitter.emit(...)` directly and querying the DB.

6. **AC6 — `data` and `metrics` round-trip as JSON.** A `data`
   payload containing nested dicts + lists (including a non-JSON-
   serializable object like a `Path`) is stored without raising,
   using `json.dumps(default=str)`. Read-back via `_get_trace_events_sync`
   restores it as a plain dict.

7. **AC7 — `session_id` is denormalized correctly.** A chat run on
   session S leaves every emitted row with `session_id = S`. Events
   emitted *before* the session is adopted on the emitter (an edge
   case during construction) carry `NULL` and are accepted.

8. **AC8 — Persist failures do not break the SSE stream.** When the
   DB write raises (forced by monkeypatching the store), the event
   still reaches `self.queue` for SSE; the run finishes; an error
   is logged. Tested by stubbing `_write_trace_event_sync` to raise
   and asserting the run completes without exception.

### Read path

9. **AC9 — Memory hit serves from `TraceStore`.** When the in-memory
   store has the trace, `GET /api/trace/{id}` returns the in-memory
   summary unchanged. (Regression guard — existing happy path is
   unaffected.)

10. **AC10 — DB fallback reconstructs the summary.** When the
    in-memory store evicts the trace (or never knew it — server
    restart simulation), `GET /api/trace/{id}` SELECTs from
    `trace_events` + `messages` and returns a `TraceSummary` with
    the same JSON shape (`trace_id`, `message`, `answer`, `events`).
    Events come back ordered by `seq`. Tested by writing rows
    directly + clearing the in-memory store + hitting the endpoint.

11. **AC11 — Unknown trace_id is still 404.** No false 200s — if
    neither memory nor DB has the trace, the endpoint returns 404 as
    before.

### Cleanup

12. **AC12 — `clear_all` zeroes `trace_events` and reports it.** The
    return shape includes `trace_events_deleted: N` (an integer
    count of rows wiped). After the call, `SELECT COUNT(*) FROM
    trace_events == 0`. AC4's audit test pins this.

13. **AC13 — `delete_session(sid)` cascades to `trace_events`.**
    Seed two trace_events rows for session S; delete session S; both
    rows are gone. Verified by direct `SELECT COUNT(*)`.

### Cross-cutting

14. **AC14 — Constitution gates green.** `ruff check .` clean,
    `pytest -q` green end-to-end (with `OPENAI_API_KEY`), no
    `TraceEvent` / `Stage` / `Phase` change so `frontend/src/types/events.ts`
    is untouched and `npm run build` stays green without FE edits.

15. **AC15 — `docs/data-model.md` updated.** New `trace_events`
    section under "Tables", entry in the ERD, mention under "How
    `clear_all` wipes everything", entry under "What's NOT a table"
    removed (it's now a table — bring the doc + reality back into
    parity).

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.** The on-the-wire shape is
  identical. `backend/app/schemas.py` ↔ `frontend/src/types/events.ts`
  unchanged.
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` (§6): **unchanged.**
- Cloud map (§5): **unchanged** at the station level; the new table
  maps to the same managed SQL service the rest of the relational
  store already documents (Azure SQL / Cloud SQL / RDS).
- New endpoints: **none.** `GET /api/trace/{id}` gains DB-fallback
  semantics — same URL, same shape.
- Modified endpoints: **none** at the wire level (just the fallback
  internal logic on `GET /api/trace/{id}`).
- DB schema:
  - **New table** `trace_events` (10 columns documented in AC1).
  - **New index** `idx_trace_events_session` on `(session_id, ts)`.
  - `PRAGMA user_version` bumps from 2 → 3.

## Open questions (resolved during clarify — 2026-05-28)

- [x] **What counts as a "log"?** → **Trace events only.** Python
  `logging` capture is out of scope; the structured trace covers the
  visualizer's needs.
- [x] **Header table or single denormalized?** → **Single
  denormalized `trace_events`.** Derivable views cover the headers.
- [x] **Write timing?** → **Real-time per `emit`** via
  `asyncio.to_thread`. ~30ms per chat is negligible next to the LLM
  round-trip; failure is logged and doesn't break SSE.
- [x] **Retention?** → **Unbounded.** User clears via the existing
  025 "Clear databases" flow. A future spec 049 can add a sweeper
  if the row count ever bites.
- [x] **`message_id` column?** → **No.** `trace_id == message_id` by
  construction (chat endpoint reuses `trace_id` when calling
  `write_message`). Storing both would be redundant. The DB-fallback
  read joins `trace_events.trace_id = messages.id` to fetch
  `message` + `answer`.
- [x] **FK on `session_id`?** → **Yes** — `ON DELETE CASCADE`.
  Single-session delete cleans up its traces for free.
- [x] **Separate "Clear traces" button vs fold into clear_all?** →
  **Fold into `clear_all`.** Consistent with how 027 added
  `skills_deleted` and 044 added `agents_deleted`. A dedicated
  "Clear traces only" affordance can be a follow-up if needed.
- [x] **Reading: replace `trace_store` entirely or layer?** →
  **Layer.** Memory hit stays cheap; DB fallback only on miss. The
  in-memory store stays around exactly as today.

## Out of scope / deferred

- A `traces` header table (`status`, `finished_at`, `event_count`).
- Listing endpoint `GET /api/traces` (filterable by session).
- Frontend changes — no new UI, no new strings.
- Sweep job / age-based retention.
- Distributed tracing (multi-instance, shared store).
- Capturing Python `logger` output.
- Index tuning past the one `(session_id, ts)` index.
