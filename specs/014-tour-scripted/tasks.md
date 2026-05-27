# Tasks: Scripted, anchored guided tour

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Check boxes as you go and
> advance the spec status (`planned → in-progress → done`).
>
> **Extends `005-guided-tour`** (done) and `004-timeline-phases` (done).
> **Clarify resolved** — empty-state = canned trace · anchor = balloon next to node ·
> copy = new scripted narration (`spec.md`, 2026-05-27).

## Phase 1 — Emphasis as a projection (AC2, AC3)

- [x] **T1 — test first**: in `frontend/src/lib/derive.test.ts`, assert
  `deriveView(events, upto, station)` returns `emphasizedStation === station` (exactly
  one) while a tour station is passed, and `null` when it is omitted / the run finished.
- [x] **T2 — implement**: add optional `tourStation?: StationId | null` to `deriveView`
  and `emphasizedStation` to `DerivedView` in `frontend/src/lib/derive.ts`.

## Phase 2 — Reducer station exposure (AC1)

- [x] **T3 — test first**: extend `frontend/src/lib/tour.test.ts` to assert each
  `tourSteps` stop exposes `cursor` **and** the `station` owning the phase's first event.
- [x] **T4 — implement**: confirm/keep `tourSteps` shape (already returns
  `{ cursor, station, phase }`); no behavior change expected — test pins the contract.

## Phase 3 — Scripted narration + CTA (AC4, §4)

- [x] **T5 — test first**: assert every `TimelinePhase` has a **non-empty** narration in
  en **and** pt (parity), and the empty-state CTA exists in both languages.
- [x] **T6 — implement**: add `tour.narration` (per-phase, long scripted copy) + the
  empty-state CTA to `frontend/src/i18n/strings.ts` (en + pt); expose `tourNarrationFor`
  in `frontend/src/lib/tour.ts`.

## Phase 4 — Canned trace for the empty state (AC6)

- [x] **T7 — capture (dev)**: run one real turn against the backend, fetch
  `GET /api/trace/{id}`, save the events as `frontend/src/lib/tourTrace.ts`
  (`TraceEvent[]`) with a provenance comment.
- [x] **T8 — test first**: `frontend/src/lib/tourTrace.test.ts` — every event's `stage`
  is in `STAGE_TO_STATION` and `deriveView(tourTrace, last)` reaches a finished run.
- [x] **T9 — test first**: in `frontend/src/store/useSimulator.tour.test.ts`, assert
  `startTour` with **empty** `events` loads `tourTrace` and begins (status `playing`);
  emphasis (derived station) clears on stop/done.
- [x] **T10 — implement**: `startTour` loads `tourTrace` when `events` is empty; derive
  with `currentStep(tour)?.station`; release on stop/done. Keep replay↔tour exclusion.

## Phase 5 — UI: anchored balloon, emphasis, salient control

- [x] **T11 — implement**: rewrite `TourCaption.tsx` to anchor the balloon next to the
  emphasized node (position from `layout.ts` + React Flow viewport transform), render
  the new narration, raise salience, point a connector at the node.
- [x] **T12 — implement**: render the `emphasizedStation` highlight in `FlowCanvas`/
  `StationNode` (distinct from `selected`); enable empty-state ▶ Tour in
  `TourControls.tsx` with the "preview the journey" CTA. Tokens only (no hardcoded
  colors — passes the theme guard).

## Phase 6 — Verify & refactor

- [x] **T13 — update 005 guard**: adjust the 005 empty-state-gating expectation that
  014 intentionally supersedes (▶ Tour is now enabled + loads the canned trace).
- [x] **T14 — gates**: `npm test` (Vitest) green · `npm run build` (`tsc --noEmit` +
  build) clean. Reducer/projection stay pure; protocol untouched.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC6)
- [x] `npm test` + `npm run build` pass
- [x] No protocol change; `STAGE_TO_STATION` / `STAGE_TO_PHASE` only *read*
- [x] All new prose (narration + CTA) exists in en **and** pt
- [x] Canned trace is a captured **real** run (provenance documented) and guarded
- [x] `spec.md` status updated to `done`

## Implementation notes (2026-05-27, done)

- **Canned trace** captured verbatim from a real batch run (model `gpt-4.1-mini`):
  `curl -X POST localhost:8000/api/chat -d '{"message":"What is 47 * 89? And what
  does RAG stand for in AI engineering?","mode":"batch"}'` → saved the returned
  `events` to `frontend/src/lib/tourTrace.ts`. 33 events, exercises every phase
  incl. a real calculator `mcp.call` (47×89 = 4183). Provenance lives in the file.
- **Captions kept, narration added.** `tour.captions` (terse) still feeds the
  Timeline phase-chip hover hint; `tour.narration` (the new longer "👉" copy) is a
  *new* sibling used only by the balloon — so the balloon got the scripted prose
  without breaking `Timeline.tsx`.
- **Balloon anchoring** uses React Flow's `useViewport()` (so `App.tsx` wraps the
  canvas + `TourCaption` in a shared `<ReactFlowProvider>`); it maps the node's
  `layout.ts` flow rect → screen, picks the side with room (right for client/API/
  Agent columns, left for the data/AI-Ops columns), clamps inside the canvas, and
  points a violet triangle at the node. Falls back to bottom-centered if geometry
  isn't ready. Emphasis = `.tour-emphasis` violet ring on the node (distinct from
  the accent spotlight + the `selected` ring). Verified headless: empty-state CTA
  loads the trace, exactly one node emphasized per stop, balloon flips left for the
  Database/RAG nodes.
