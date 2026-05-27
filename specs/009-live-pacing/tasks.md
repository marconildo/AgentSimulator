# Tasks: Live pacing

> TDD checklist for `009-live-pacing`. Red → green → refactor. Frontend-only.

## Tasks

- [x] **T1 — test first (AC1/AC2)**: `lib/pacing.test.ts` — `paceAdvance` advances
      one structural event per `LIVE_STEP_MS` and visits every index in order;
      flushes a run of token events in a single step. (Fails: no `pacing.ts`.)
- [x] **T2 — implement**: create `lib/pacing.ts` (`LIVE_STEP_MS`, `isFastForward`,
      `paceAdvance`) → T1 green.
- [x] **T3 — test first (AC3)**: in `lib/pacing.test.ts`, replay a full run through
      `paceAdvance` + `deriveView`; assert pre-LLM cursors give `answer === ""` and
      the answer turns non-empty only at/after the `llm` station.
- [x] **T4 — implement**: (covered by T2) confirm ordering guarantee makes T3 green.
- [x] **T5 — test first (AC4/AC5)**: `store/useSimulator.pacing.test.ts` —
      `beginRun` then several `pushTrace` leaves `cursor` off the tail (no snap);
      a manual tick with `following:false` changes nothing.
- [x] **T6 — implement**: `useSimulator.ts` — drop the snap in `pushTrace`; add
      `liveTimer`/`liveAdvanceAt` + start/stop helpers; wire `beginRun`/`endRun`/
      `reset`/`togglePlay`/`step`/`startTour`. → T5 green.
- [x] **T7 — regression**: `lib/derive.test.ts` still green (AC6 settled end frame);
      `useSimulator.tour.test.ts` still green (mutual exclusion).
- [x] **T8 — refactor**: tidy timer lifecycle, keep all tests green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm test` (Vitest) green
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] No protocol change (schemas.py ↔ events.ts untouched); every Stage still mapped
- [x] No new user-facing text (n/a for en/pt)
- [x] `spec.md` status → `done`
