# Tasks: App Database query detail

> TDD checklist. Each implement task is preceded by the failing test that drives it.

## Tasks

- [x] **T1 — test first (AC4)**: failing test for `_inline_sql` — substitutes
      params left-to-right and truncates over-long string/JSON values with `…`
      (`backend/tests/test_db.py`).
- [x] **T2 — implement**: add `_inline_sql` formatter + `_record` helper to
      `store.py`; make T1 pass.
- [x] **T3 — test first (AC1)**: `read_history` END dict carries `queries` with the
      `SELECT COUNT(*)` and the `SELECT message, answer … LIMIT ?`, each with
      `operation`/`sql`/`rows`.
- [x] **T4 — implement**: accumulate + return `queries` in `_read_history_sync`.
- [x] **T5 — test first (AC2)**: `write_message` END dict `queries` include INSERT
      messages + UPDATE sessions + COUNT, in execution order.
- [x] **T6 — test first (AC3)**: with a pinned attachment, write `queries` add the
      `SELECT 1 FROM documents …` + `INSERT INTO message_documents …`; without, neither.
- [x] **T7 — implement**: accumulate + return `queries` in `_write_message_sync`
      (record each statement, including the attachment branch); make T5+T6 pass.
- [x] **T8 — protocol mirror**: document `data.queries` in `schemas.py` `TraceEvent`
      docstring; add `DbQuery` to `frontend/src/types/events.ts`.
- [x] **T9 — test first (AC5)**: `selectDatabase` exposes `queries` per operation;
      absent `queries` → `[]` (graceful) (`stationDetail.test.ts`).
- [x] **T10 — implement**: extend `DbDetailData` + `selectDatabase`.
- [x] **T11 — test first (AC5)**: `DatabaseDetail` renders one SQL row per statement
      with `→ N rows` under the matching block (`DatabaseDetail.test.tsx`).
- [x] **T12 — implement**: render queries in `DatabaseDetail.tsx`.
- [x] **T13 — i18n (AC6)**: add `dbDetail.queriesRead/queriesWrite/rowsAffected`
      in en + pt.
- [x] **T14 — refactor**: clean up, keep all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` + `ruff format .` clean (store.py / schemas.py / test_db.py)
- [x] `pytest -q` green for the touched files (test_db / schema_audit / clear_coverage)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` — the new DatabaseDetail tests pass; 16 pre-existing failures
      (theme/selection/onboarding/SettingsPage) are environmental on `main`, not from this change
- [x] Protocol mirror in sync (`schemas.py` docstring ↔ `events.ts` `DbQuery`)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
- [ ] Consider GitHub Pages demo re-capture (058) — App DB queries now in fixtures?
