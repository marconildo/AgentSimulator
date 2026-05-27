# Tasks: Per-phase latency waterfall

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> Builds on `004` (`STAGE_TO_PHASE`) + `007` (`formatLatency`). **Clarify resolved** —
> Timeline panel · per-phase (occurrences separate) · reconcile-to-wall-clock with an
> `overhead/transit` remainder (`spec.md`, 2026-05-27).

## Phase 1 — Pure waterfall function (AC1, AC2, AC3, AC4)

- [x] **T1 — test first**: in `frontend/src/lib/waterfall.test.ts`, build a linear log
  and assert `waterfallSegments` returns ordered `{ phase, label, durationMs, offsetMs }`
  segments in run order, with `offsetMs` of the first segment ≈ 0 (AC1).
- [x] **T2 — test first**: a log with a ReAct loop (reason → tools → reason → tools)
  yields **two** `reason` and **two** `tools` segments, order preserved (AC2).
- [x] **T3 — test first**: total == `toMs(last.ts) − toMs(first.ts)` within rounding;
  the `backend` envelope is **not** a bar; the unattributed remainder is a single
  `overhead` segment so `Σ durations === total` (AC3); durations render via
  `formatLatency` incl. the `<1 ms` floor (AC4).
- [x] **T4 — implement**: `frontend/src/lib/waterfall.ts` — `WaterfallSegment` +
  `waterfallSegments(events)`, using `STAGE_TO_PHASE`, `toMs`, per-occurrence grouping,
  envelope exclusion, and the floored overhead reconciliation.

## Phase 2 — i18n (AC5, §4)

- [x] **T5 — test first**: assert `timeline.timing.{title,total,overhead,empty}` exist
  in **both** en and pt (parity).
- [x] **T6 — implement**: add those strings to `frontend/src/i18n/strings.ts` (en + pt).

## Phase 3 — Timing panel (UI)

- [x] **T7 — implement**: `frontend/src/components/TimingPanel.tsx` — proportional bars
  (phase label via `phaseLabelsFor`, width ∝ `durationMs`, value via `formatLatency`),
  the `overhead/transit` bar, and the total. Tokens only (theme guard).
- [x] **T8 — implement**: mount `TimingPanel` in `frontend/src/components/Timeline.tsx`
  (collapsible, beside/under the phase rail); empty-state copy when no run.

## Phase 4 — Verify & refactor

- [x] **T9 — gates**: `npm test` (Vitest) green · `npm run build` (`tsc --noEmit` +
  build) clean. Function stays pure; protocol untouched.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC5)
- [x] `npm test` + `npm run build` pass
- [x] No protocol change; only *reads* `ts` / `latency_ms` / `STAGE_TO_PHASE`
- [x] All new chrome exists in en **and** pt; phase names reuse `phaseLabelsFor`
- [x] `spec.md` status updated to `done`
