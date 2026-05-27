# Tasks: Revisit a turn's trace (message ↔ trace link)

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Enables 018 + 020.** **Clarify resolved** — refetch + memoized cache · auto-load the
> latest turn · clear "trace expired" state (`spec.md`, 2026-05-27). Frontend-only.

## Phase 1 — Memoized trace loader (AC2 source, expired)

- [x] **T1 — test first**: `frontend/src/lib/traceCache.test.ts` — `loadTrace(id)` fetches
  once then serves from cache; a 404 resolves to an `expired` result (no throw).
- [x] **T2 — implement**: `frontend/src/lib/traceCache.ts` over the existing `fetchTrace`
  (memoize by `trace_id`; `{ ok, events } | { expired: true }`). Shared by 018/020.

## Phase 2 — Static load into the simulator (AC1, AC3)

- [x] **T3 — test first**: `frontend/src/store/useSimulator.loadTrace.test.ts` —
  `loadTrace(events)` sets events + cursor (last), `status: "done"`, and `step`/replay
  operate; it is a **no-op while streaming**; a fresh `beginRun` after is clean (AC3).
- [x] **T4 — implement**: add `loadTrace(events)` to `useSimulator` (static settled load,
  no timers; guarded against an active run).

## Phase 3 — Auto-load on switch + click to revisit (AC2)

- [x] **T5 — test first**: `useChat` — `openSession` auto-loads the latest message's
  trace (canvas not empty); an expired latest trace sets `traceExpired` (click hint);
  `selectMessage(id)` loads that turn.
- [x] **T6 — implement**: wire `openSession` auto-load + `selectMessage` via the loader →
  `loadTrace`; track `traceExpired`.

## Phase 4 — i18n + UI (AC5)

- [x] **T7 — test first**: parity — `trace.*` strings exist in en **and** pt.
- [x] **T8 — implement**: add the strings; in `ChatPanel.tsx`, make past agent messages
  clickable (load trace), render the "trace expired" state. Tokens only.

## Phase 5 — Secondary hover emphasis (AC4) — after 014

- [ ] **T9 — (deferred)**: hovering a message emphasizes the stations its trace touched,
  reusing 014's `emphasizedStation` plumbing; un-hover clears. Lands after 014.

## Phase 6 — Verify & refactor

- [x] **T10 — gates**: `npm test` (Vitest) · `npm run build` — green. No protocol change;
  consumes existing `TraceSummary`.

## Definition of done

- [x] Core acceptance criteria map to passing tests (AC1, AC2, AC3, AC5)
- [ ] AC4 (hover emphasis) tracked as secondary, after 014
- [x] Re-opening a conversation never leaves a dead canvas; expired → clear state
- [x] Loader memoizes by `trace_id` (the shared 018/020 mechanism)
- [x] No protocol change; `trace.*` strings exist in en **and** pt
- [x] `spec.md` status updated to `done`
