# Tasks: Scripted, anchored guided tour

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Check boxes as you go and
> advance the spec status (`planned → in-progress → done`).
>
> **Extends `005-guided-tour`** (done) and `004-timeline-phases` (done).
> **Clarify resolved** — empty-state = canned trace · anchor = balloon next to node ·
> copy = new scripted narration (`spec.md`, 2026-05-27).

## Phase 1 — Emphasis as a projection (AC2, AC3)

- [ ] **T1 — test first**: in `frontend/src/lib/derive.test.ts`, assert
  `deriveView(events, upto, station)` returns `emphasizedStation === station` (exactly
  one) while a tour station is passed, and `null` when it is omitted / the run finished.
- [ ] **T2 — implement**: add optional `tourStation?: StationId | null` to `deriveView`
  and `emphasizedStation` to `DerivedView` in `frontend/src/lib/derive.ts`.

## Phase 2 — Reducer station exposure (AC1)

- [ ] **T3 — test first**: extend `frontend/src/lib/tour.test.ts` to assert each
  `tourSteps` stop exposes `cursor` **and** the `station` owning the phase's first event.
- [ ] **T4 — implement**: confirm/keep `tourSteps` shape (already returns
  `{ cursor, station, phase }`); no behavior change expected — test pins the contract.

## Phase 3 — Scripted narration + CTA (AC4, §4)

- [ ] **T5 — test first**: assert every `TimelinePhase` has a **non-empty** narration in
  en **and** pt (parity), and the empty-state CTA exists in both languages.
- [ ] **T6 — implement**: add `tour.narration` (per-phase, long scripted copy) + the
  empty-state CTA to `frontend/src/i18n/strings.ts` (en + pt); expose `tourNarrationFor`
  in `frontend/src/lib/tour.ts`.

## Phase 4 — Canned trace for the empty state (AC6)

- [ ] **T7 — capture (dev)**: run one real turn against the backend, fetch
  `GET /api/trace/{id}`, save the events as `frontend/src/lib/tourTrace.ts`
  (`TraceEvent[]`) with a provenance comment.
- [ ] **T8 — test first**: `frontend/src/lib/tourTrace.test.ts` — every event's `stage`
  is in `STAGE_TO_STATION` and `deriveView(tourTrace, last)` reaches a finished run.
- [ ] **T9 — test first**: in `frontend/src/store/useSimulator.tour.test.ts`, assert
  `startTour` with **empty** `events` loads `tourTrace` and begins (status `playing`);
  emphasis (derived station) clears on stop/done.
- [ ] **T10 — implement**: `startTour` loads `tourTrace` when `events` is empty; derive
  with `currentStep(tour)?.station`; release on stop/done. Keep replay↔tour exclusion.

## Phase 5 — UI: anchored balloon, emphasis, salient control

- [ ] **T11 — implement**: rewrite `TourCaption.tsx` to anchor the balloon next to the
  emphasized node (position from `layout.ts` + React Flow viewport transform), render
  the new narration, raise salience, point a connector at the node.
- [ ] **T12 — implement**: render the `emphasizedStation` highlight in `FlowCanvas`/
  `StationNode` (distinct from `selected`); enable empty-state ▶ Tour in
  `TourControls.tsx` with the "preview the journey" CTA. Tokens only (no hardcoded
  colors — passes the theme guard).

## Phase 6 — Verify & refactor

- [ ] **T13 — update 005 guard**: adjust the 005 empty-state-gating expectation that
  014 intentionally supersedes (▶ Tour is now enabled + loads the canned trace).
- [ ] **T14 — gates**: `npm test` (Vitest) green · `npm run build` (`tsc --noEmit` +
  build) clean. Reducer/projection stay pure; protocol untouched.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC6)
- [ ] `npm test` + `npm run build` pass
- [ ] No protocol change; `STAGE_TO_STATION` / `STAGE_TO_PHASE` only *read*
- [ ] All new prose (narration + CTA) exists in en **and** pt
- [ ] Canned trace is a captured **real** run (provenance documented) and guarded
- [ ] `spec.md` status updated to `done`
