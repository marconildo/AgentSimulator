# Tasks: Timeline navigable by phase

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is
> preceded by the test that must fail first (red → green → refactor). Check boxes
> as you go and advance the spec status (`clarified → in-progress → done`).
>
> **Clarify resolved** — Q1–Q4 answered in `spec.md` (2026-05-26).

## Phase 1 — Pure phase model (AC1, AC2, AC4, AC6)

- [x] **T1 — test first**: in `frontend/src/lib/phases.test.ts`, assert
  `STAGE_TO_PHASE` covers every `Stage` exactly once (exhaustive, no overlap);
  `phaseMarkers(events)` returns occurring phases in run order with the
  first-event index; `activePhase(events, cursor)` returns the cursor's phase.
- [x] **T2 — implement**: create `frontend/src/lib/phases.ts` with
  `TimelinePhase`, `PHASE_ORDER`, `STAGE_TO_PHASE`, `phaseMarkers`,
  `activePhase`, `phaseLabelsFor(lang)`.

## Phase 2 — i18n (AC5, §4)

- [x] **T3 — test first**: assert every `TimelinePhase` has an en **and** pt
  label via `phaseLabelsFor`.
- [x] **T4 — implement**: add `timeline.phases.*` to `strings.ts` (en + pt).

## Phase 3 — Timeline rail (AC3)

- [x] **T5 — implement**: render the phase rail in `Timeline.tsx` from
  `phaseMarkers`; emphasize `activePhase`; `onClick → setCursor(marker.index)`.
  Resolved Q4 (replaced the ticks with the named chip rail) and Q2 (full
  canonical rail; missing phases shown disabled). Q3: `×N` badge from
  `marker.count`.
- [x] **T6 — test**: covered the marker→cursor mapping (the value passed to
  `setCursor` equals `marker.index`) at the logic level (AC2/AC3 tests assert
  `marker.index` is the phase's first-event index).

## Phase 4 — Verify & refactor

- [x] **T7 — refactor**: kept `phases.ts` pure; `deriveView`, `schemas.py`,
  `events.ts`, `STAGE_TO_STATION` untouched. Noted the second exhaustive map in
  `CLAUDE.md`'s add-a-stage checklist.
- [x] **T8 — gates**: `npm test` (Vitest, 32 passed) · `npm run build`
  (`tsc --noEmit` + build, clean). No backend change, so `ruff`/`pytest`
  unaffected.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm test` + `npm run build` pass
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched); every `Stage`
      still mapped to a station **and** now to a phase
- [x] All phase labels exist in en **and** pt
- [x] `spec.md` status updated to `done`
