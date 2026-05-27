# Tasks: Chat bubble stays in lockstep with the paced flow

> Ordered TDD checklist. Each implement task is preceded by the test that should
> fail first (red → green → refactor).

## Tasks

- [x] **T1 — test first (AC1/AC3/AC4/AC5)**: write `frontend/src/lib/chatStatus.test.ts`
  covering `pendingBubble` (status-then-answer, stream replay, batch-shaped log) and
  the `isFlowSettled` truth table. Failed — module didn't exist yet.
- [x] **T2 — implement**: create `frontend/src/lib/chatStatus.ts` (`PendingBubble`,
  `pendingBubble`, `isFlowSettled`). Made T1 green.
- [x] **T3 — test first (AC2)**: added the `chat.stage` en↔pt parity / non-blank test
  to `chatStatus.test.ts`. Failed — strings absent.
- [x] **T4 — i18n (§4)**: added `chat.stage: Record<TimelinePhase, string>` to the
  `Strings` interface and both `en` + `pt` blocks in `i18n/strings.ts`. Made T3 green.
- [x] **T5 — test first (AC6)**: extended `frontend/src/store/useChat.test.ts` — after a
  mocked `streamChat` resolves, `pending` stays non-null and `messages` is unapplied
  while the simulator is not settled; once settled, `pending` clears and `messages`
  apply. Failed — `send()` swapped eagerly.
- [x] **T6 — implement**: added `waitForFlowSettled` (+ `settledOrAborted` guard for the
  no-events / abort cases) and gated the persisted swap in `useChat.send()` on it.
  Made T5 green; fixed one pre-existing test's mock to signal `onDone` realistically.
- [x] **T7 — wire UI**: `App.tsx` computes `pendingBubble` and passes it; `ChatPanel`
  renders `StageStatus` (typing dots + stage label / `Thinking…`) vs the streaming answer.
- [x] **T8 — refactor**: tidied; `tsc --noEmit` + vite build clean, all Vitest green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (AC1–AC5 in `chatStatus.test.ts`, AC6 in `useChat.test.ts`)
- [x] `npm run build` passes (`tsc --noEmit` + vite build)
- [x] `npm test` (Vitest) green — 101 tests
- [x] No protocol change — `events.ts` / `STAGE_TO_STATION` / `STAGE_TO_PHASE` untouched
- [x] All new user-facing text (`chat.stage.*`) exists in en **and** pt
- [x] `spec.md` status updated to `done`
- [x] Backend untouched (no `ruff`/`pytest` impact — frontend-only change)
