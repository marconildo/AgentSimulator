# Plan: First-visit onboarding — auto-tour, calmer pacing, canvas-first frame

> HOW for `spec.md` (status: planned). Respects the constitution: frontend-only, no
> protocol/`Stage` change, bilingual, single-instance (the flag is per-browser
> `localStorage`, not shared server state — consistent with §8).

## Approach

Three small, independent seams, all reusing the existing tour (005/014) and panel-collapse
(013) machinery — nothing new on the canvas, no backend:

1. **First-visit flag** — a tiny `lib/onboarding.ts`, mirroring `lib/scenario.ts`: a
   `localStorage` key read once at module load. Pure helpers `isFirstVisit()`,
   `markOnboarded()`, `shouldAutoOnboard()`, `initialInspectorCollapsed()` so the decision is
   unit-testable and used in two places (store init + the App mount effect).

2. **Auto-tour + canvas-first frame** — the simulator store seeds `inspectorCollapsed` from
   `initialInspectorCollapsed()`. A one-shot mount effect in `App.tsx` calls
   `markOnboarded()` then `startTour()` when `shouldAutoOnboard()` is true (sim page only).
   `startTour()` already loads the canned trace from an empty state (014 AC6), so auto-onboard
   needs no new tour entry point. To keep the canvas the hero through the tour, the tour
   applies its station selection **without** the reveal side-effect: `select` gains an
   optional `{ reveal?: boolean }` (default `true`, so the manual click path is untouched),
   and `applyTourStep` passes `reveal: false`.

3. **Pacing** — bump `TOUR_PACE_MS` 3500 → 7000. Add two pure reducers `tourNext`/`tourPrev`
   to `lib/tour.ts` (advance/retreat one stop, clamp at the ends, set status `paused`), and
   store actions `tourNextStep`/`tourPrevStep` that stop the auto timer, apply the reducer,
   and `applyTourStep`. `TourControls` renders ◀ / ▶ around the existing pause·resume·stop.

Alternative considered: a welcome modal/coach-marks — rejected at clarify (heavier, new
overlay, duplicates what the scripted tour already narrates). Persisting the Inspector
open/closed choice — rejected (first-visit default only).

## Affected files

**Backend** — none.

**Frontend**
- `frontend/src/lib/onboarding.ts` — **new.** First-visit detection helpers + the
  `localStorage` flag (`agentsim.onboarded`), mirroring `scenario.ts`.
- `frontend/src/lib/tour.ts` — `TOUR_PACE_MS` 3500 → 7000; add `tourNext`, `tourPrev`.
- `frontend/src/store/useSimulator.ts` — init `inspectorCollapsed` from
  `initialInspectorCollapsed()`; `select` gains optional `{ reveal }`; `applyTourStep` uses
  `reveal: false`; add `tourNextStep` / `tourPrevStep` actions (and to the `SimulatorState`
  type).
- `frontend/src/App.tsx` — one-shot mount effect: `if (shouldAutoOnboard()) { markOnboarded();
  startTour(); }` (sim page only).
- `frontend/src/components/TourControls.tsx` — add ◀ (`tourPrevStep`) and ▶ (`tourNextStep`)
  buttons while touring; aria-labels/titles from `tour.prev` / `tour.next`.
- `frontend/src/i18n/strings.ts` — add `tour.prev`, `tour.next` (en + pt).

## Protocol changes (constitution §1)

None. No `schemas.py` / `events.ts` change; no new `Stage`; `STAGE_TO_STATION` and
`STAGE_TO_PHASE` stay total and untouched.

## Data model changes

None. `localStorage` only (per-browser UI preference, like scenario/cloud/theme) — not the
Chroma vector store and not the SQLite `ConversationStore`.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `tour.prev` (TourControls ◀) | Previous phase | Fase anterior |
| `tour.next` (TourControls ▶) | Next phase | Próxima fase |

No other prose changes (the tour captions/narration are reused unchanged).

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 first-visit persists | `isFirstVisit()` true on clean store, false after `markOnboarded()`; flag written to `localStorage` | `frontend/src/lib/onboarding.test.ts` |
| AC2 fires at most once | `shouldAutoOnboard()` true then false after `markOnboarded()` | `frontend/src/lib/onboarding.test.ts` |
| AC3 inspector collapsed 1st visit | `initialInspectorCollapsed()` true on first visit, false after onboarded | `frontend/src/lib/onboarding.test.ts` |
| AC4 tour keeps canvas emphasis | `select(id, { reveal: false })` keeps `inspectorCollapsed`; `select(id)` reopens | `frontend/src/store/useSimulator.onboarding.test.ts` |
| AC5 calmer dwell | `TOUR_PACE_MS >= 7000` | `frontend/src/lib/tour.test.ts` |
| AC6 manual step paused | `tourNext`/`tourPrev` advance/retreat + clamp + status `paused`; inert when idle/done | `frontend/src/lib/tour.test.ts` |
| AC7 no protocol / bilingual | `tour.prev`/`tour.next` present in en+pt; `tsc --noEmit` + `vite build` | `frontend/src/i18n/strings.test.ts` + build |

Each test is written **red first**, then the implementation makes it green (tasks.md order).
`localStorage` is available under jsdom; onboarding tests clear it in `beforeEach`.

## Risks / trade-offs

- **Store init reads `localStorage` at import time.** Tested behavior is pinned via the pure
  helpers (`initialInspectorCollapsed`), not the import-time snapshot, to avoid brittle
  module-cache ordering in tests.
- **`select` signature gains an optional arg.** Default `reveal: true` preserves every
  existing caller (manual click reopen, 013 AC3); only `applyTourStep` opts out.
- **Auto-tour on load could feel intrusive.** Mitigated: it is dismissible (⏹) at any time,
  fires once ever, and only from a clean first visit; the canned trace needs no backend so it
  works even without an `OPENAI_API_KEY`.
- **Raising the dwell touches existing tour tests.** They assert reducer behavior, not the
  pace constant; AC5 newly pins the value. Manual step reducers are additive.
