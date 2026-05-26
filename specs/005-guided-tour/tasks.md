# Tasks: Guided tour (storytelling mode)

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is
> preceded by the test that must fail first (red → green → refactor). Check boxes
> as you go and advance the spec status (`clarified → in-progress → done`).
>
> **Depends on `004-timeline-phases`** — landed (done). **Clarify resolved** —
> Q1–Q5 answered in `spec.md` (2026-05-26).

## Phase 1 — Tour reducer (AC1, AC3, AC4, AC6)

- [x] **T1 — test first**: in `frontend/src/lib/tour.test.ts`, assert `tourStep`
  advances through `phaseMarkers` in order yielding `{cursor, station, phase}`;
  pause/resume/stop transitions; auto-stop on the last phase; step carries no
  extra fields and issues no fetch.
- [x] **T2 — implement**: create `frontend/src/lib/tour.ts` (`tourStep` + step
  type, plus `tourSteps`/`beginTour`/`currentStep`/`isTouring`) on top of `004`'s
  `phaseMarkers` and `STAGE_TO_STATION`.

## Phase 2 — Captions + labels (AC2, §4)

- [x] **T3 — test first**: assert every `TimelinePhase` has en **and** pt
  captions; `tour.*` button labels exist in both languages.
- [x] **T4 — implement**: captions + `tour.*` labels in `strings.ts` (en + pt),
  resolved via `tourCaptionsFor`/`tourLabelsFor` (Q2 → strings.ts for compile-time
  en+pt lockstep).

## Phase 3 — Store driver + controls (AC3, AC4, AC5)

- [x] **T5 — test first**: `useSimulator.tour.test.ts` — `startTour` no-op with an
  empty trace (AC5); first step applied immediately; replay↔tour mutual exclusion.
- [x] **T6 — implement**: `tour` field + `startTour/pauseTour/resumeTour/stopTour`
  in `useSimulator` (Q5); a `tourTimer` mirrors the replay interval at
  `TOUR_PACE_MS` and drives `setCursor`/`select`; the phase carries the caption.

## Phase 4 — UI (AC5)

- [x] **T7 — implement**: `TourControls.tsx` (▶ Tour / ⏸ resume / ⏹, disabled with
  no trace) wired into `Timeline`; `TourCaption.tsx` caption-bar overlay in
  `<main>` (Q4). Themed via tokens only (passes the no-hardcoded-colors guard).

## Phase 5 — Verify & refactor

- [x] **T8 — refactor**: reducer kept pure; tour touches only `cursor`/`selected`/
  `tour` (the phase carrying the caption); `deriveView`/protocol untouched.
- [x] **T9 — gates**: `npm test` (Vitest, 46 passed) · `npm run build` (clean).

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm test` + `npm run build` pass
- [x] No protocol change; `STAGE_TO_STATION`/`STAGE_TO_PHASE` only *read*
- [x] All tour prose (labels + captions) exists in en **and** pt
- [x] `004-timeline-phases` landed
- [x] `spec.md` status updated to `done`
