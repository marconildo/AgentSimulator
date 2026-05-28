# Tasks: First-visit onboarding — auto-tour, calmer pacing, canvas-first frame

> TDD checklist (red → green → refactor). Frontend-only. Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC1/AC2/AC3)**: `frontend/src/lib/onboarding.test.ts` — `beforeEach`
  clears `localStorage`; assert `isFirstVisit()` true on clean store and false after
  `markOnboarded()`; `shouldAutoOnboard()` true then false; `initialInspectorCollapsed()`
  true then false. (RED — module doesn't exist.)
- [x] **T2 — implement**: `frontend/src/lib/onboarding.ts` — `ONBOARDED_KEY =
  "agentsim.onboarded"`, `isFirstVisit()`, `markOnboarded()`, `shouldAutoOnboard()`,
  `initialInspectorCollapsed()` (mirror `scenario.ts`). Make T1 green.
- [x] **T3 — test first (AC5/AC6)**: extend `frontend/src/lib/tour.test.ts` — `TOUR_PACE_MS >=
  7000`; `tourNext`/`tourPrev` advance/retreat by one, clamp at ends, set status `paused`,
  and are inert for `idle`/`done` states. (RED.)
- [x] **T4 — implement**: in `frontend/src/lib/tour.ts` bump `TOUR_PACE_MS` to 7000 and add
  `tourNext` / `tourPrev` reducers. Make T3 green.
- [x] **T5 — test first (AC4)**: `frontend/src/store/useSimulator.onboarding.test.ts` — with
  `inspectorCollapsed: true`, `select("agent", { reveal: false })` keeps it collapsed and
  sets `selected`; `select("rag")` (default) reopens it. (RED.)
- [x] **T6 — implement**: in `useSimulator.ts` add the `{ reveal?: boolean }` arg to `select`
  (default reveal), seed `inspectorCollapsed: initialInspectorCollapsed()`, make
  `applyTourStep` call `select(station, { reveal: false })`, and add `tourNextStep` /
  `tourPrevStep` actions (stop timer → apply `tourNext`/`tourPrev` → `applyTourStep`). Make
  T5 green.
- [x] **T7 — test first (AC7 i18n)**: extended `frontend/src/lib/tour.test.ts` "control labels"
  test — `tour.prev` and `tour.next` non-empty in every language (covers en + pt). (RED.)
- [x] **T8 — implement i18n**: added `tour.prev` / `tour.next` to the `tour` type + en and pt
  blocks in `strings.ts`. Make T7 green.
- [x] **T9 — wire UI (no new behavior beyond ACs)**: `TourControls.tsx` renders ◀
  (`tourPrevStep`) and ▶ (`tourNextStep`) with the new labels; `App.tsx` one-shot mount
  effect calls `markOnboarded()` + `startTour()` when `shouldAutoOnboard()` (sim page is the
  default at mount).
- [x] **T10 — refactor + gates**: `tsc --noEmit`, `npm run build`, full `vitest run` (322)
  green; `spec.md` status → `done`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC3 onboarding,
  AC4 store, AC5–AC6 tour, AC7 i18n + build)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] Full `vitest run` green (322)
- [x] No `Stage`/`events.ts` change; `STAGE_TO_STATION` / `STAGE_TO_PHASE` stay total
- [x] `tour.prev` and `tour.next` exist in en **and** pt
- [x] Backend untouched (no `ruff`/`pytest` needed)
- [ ] Manual browser confirm of the first-visit auto-tour + collapsed Inspector + ◀ ▶ pacing
- [x] `spec.md` status updated to `done`
