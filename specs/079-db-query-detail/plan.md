# Plan: App Database query detail

> HOW for `079-db-query-detail`. Additive `data` keys on existing spans — same
> shape of change as 051-failure-treatments. No new `Stage`.

## Approach

The store's sync methods already run every statement; they just don't report them.
We add a tiny per-call **statement recorder**: a small helper that, given the SQL
template + params + a `rows` count, formats the statement with values inlined and
appends `{operation, sql, rows}` to a list the method returns under a `queries` key.

`_read_history_sync` and `_write_message_sync` build a local `queries: list` and
record each `conn.execute` that is part of the turn's observable work (the two
SELECTs in read; INSERT messages / attachment SELECT+INSERT / UPDATE sessions /
COUNT in write), then include `queries` in their returned dict. Because `main.py`
sets `db_rec.data = await store.read/write(...)`, the list rides the existing
`db.read` / `db.write` END event with no protocol-structure change.

Value inlining is done by a pure formatter (`_inline_sql(template, params)`):
collapses the `?` placeholders left-to-right with `repr`-ish rendering, truncating
any string/JSON param past a cap (e.g. 80 chars) with `…`. This is display-only and
never re-fed to SQLite, so there is no injection concern — the real execution still
uses parametrized binding.

Frontend: `selectDatabase` reads `read.data.queries` / `write.data.queries` into
typed `DbQuery[]` (default `[]`). `DatabaseDetail` renders each as a `<Mono>` SQL
block + a `→ N rows` caption under the matching section. Absent `queries` → today's
view (AC5 graceful degradation).

Alternatives considered: (a) a generic `execute()` wrapper on the connection that
auto-records — heavier, touches every query in the store including migrations, more
risk; rejected in favor of recording only the turn's statements explicitly. (b)
A new `db.query` Stage per statement — violates "no new Stage for an additive
detail" and would explode the event count; rejected.

## Affected files

**Backend**
- `backend/app/db/store.py` — add `_inline_sql` formatter + a `_record` helper;
  `_read_history_sync` and `_write_message_sync` accumulate `queries` and return it.
- `backend/app/schemas.py` — extend the `TraceEvent` docstring to document
  `db.read`/`db.write` `data.queries` (`{operation, sql, rows}`).

**Frontend**
- `frontend/src/types/events.ts` — add `DbQuery` ( `{operation, sql, rows}` ) and
  reference it in the db data typing (mirror of the backend additive key).
- `frontend/src/lib/stationDetail.ts` — `DbDetailData.read/write` gain
  `queries: DbQuery[]`; `selectDatabase` reads them (default `[]`).
- `frontend/src/components/DatabaseDetail.tsx` — render the queries under each block.
- `frontend/src/i18n/strings.ts` (`dbDetail`) — new labels (queries heading,
  rows-affected suffix) in en + pt.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — docstring only; `data.queries` is additive, no new
  `Stage`/`Phase`/field on `TraceEvent`.
- `frontend/src/types/events.ts` — add `DbQuery` interface mirroring the key.
- Emitted in: `backend/app/main.py` (the existing `db.read` / `db.write` spans,
  via the store return value assigned to `db_rec.data`).
- Mapped to station in `stations.ts`: `database` — already mapped, unchanged.
- `readoutFor` / `renderDetail` case added: **n/a** — no new station; the canvas
  readout and Inspector are unchanged. Only the full-view overlay changes.

## Data model changes

None. No schema change, no migration. We observe existing statements; we do not add
columns or tables.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `dbDetail.queriesRead` | Statements executed | Comandos executados |
| `dbDetail.queriesWrite` | Statements executed | Comandos executados |
| `dbDetail.rowsAffected(n)` | → {n} rows | → {n} linhas |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | read `queries` has both SELECTs with operation/sql/rows | `backend/tests/test_db.py` |
| AC2 | write `queries` has INSERT messages + UPDATE sessions + COUNT, ordered | `backend/tests/test_db.py` |
| AC3 | write `queries` include attachment SELECT+INSERT iff a doc is pinned | `backend/tests/test_db.py` |
| AC4 | `_inline_sql` substitutes values + truncates long ones; rows reflect reality | `backend/tests/test_db.py` |
| AC5 | `selectDatabase` exposes `queries`; `DatabaseDetail` renders SQL + rows; absent → summary-only | `frontend/src/lib/stationDetail.test.ts`, `frontend/src/components/DatabaseDetail.test.tsx` |
| AC6 | en + pt keys present | covered by the strings parity test / build |

## Risks / trade-offs

- **Value inlining honesty**: the inlined SQL is for *display*; the real run is
  parametrized. The formatter must make truncation visible (`…`) so no one mistakes
  a truncated value for the full one. No SQL is ever re-executed from the string.
- **Determinism**: statement set is deterministic per turn shape (attachments vs
  not), so structural assertions are stable across model variability.
- **Single-instance (§7)**: unchanged — still per-trace, in-process.
- **Perf**: a handful of small string formats per turn; negligible vs the SQLite
  round-trips already happening.
