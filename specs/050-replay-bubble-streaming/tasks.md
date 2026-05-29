# Tasks: Replay also re-fills the chat bubble (status → streamed answer)

> Pure FE projection wiring. Order = TDD; each implementation task is
> preceded by the failing test. Backend, protocol, i18n strings: all
> untouched, so the gates split cleanly into a frontend-only path.

## Tasks

### Pre-flight

- [ ] **T0 — verify the gates are green before starting.**
      `ruff check .` clean · `pytest -q` green (with `OPENAI_API_KEY`)
      · `npm run build` clean · `npm test` (Vitest) green. No drift
      from `main` before adding new failing tests.

### Projection helper (AC1, AC8, AC10)

- [ ] **T1 — test first** (in a new
      `frontend/src/lib/chatStatus.replay.test.ts`):
      `test_replay_bubble_renders_status_when_no_answer_yet` (AC1).
      Build a `DerivedView` with `answer === ""`, call
      `replayBubble(view, "reason", { hasEvents: true, isSettled:
      false, persistedAnswer: "final" })`; assert the result is
      `{ kind: "status", phase: "reason" }`.
      → **red** (function not exported yet).
- [ ] **T2 — test first**: `test_replay_bubble_falls_back_when_no_events`
      (AC8). Same call with `hasEvents: false`; assert the result is
      `{ kind: "answer", text: "final", streaming: false }`.
      → **red**.
- [ ] **T3 — test first**: `test_replay_bubble_settles_to_persisted_at_tail`
      (AC4 — projection half). Set `isSettled: true`, `view.answer
      = "stream"`, `persistedAnswer = "final"`; assert the result is
      `{ kind: "answer", text: "final", streaming: false }` (settled
      always picks persisted, never the reassembled stream).
      → **red**.
- [ ] **T4 — test first**: `test_stepped_cursor_progression_is_monotone`
      (AC10). Walk a canned `events[]` from cursor `-1` through the
      tail, calling `replayBubble` at each step; assert the sequence
      is `status:*` (one or more, monotone phase) → `answer:partial`
      (with `streaming: true`) → `answer:final` (with
      `streaming: false`). No regression to a status state after an
      answer state was seen.
      → **red**.
- [ ] **T5 — implement** `replayBubble(view, phase, opts)` in
      `frontend/src/lib/chatStatus.ts` (next to `pendingBubble`):
      - Returns `{ kind: "answer", text: persistedAnswer, streaming:
        false }` when `isSettled || !hasEvents`.
      - Else delegates to `pendingBubble(view, phase)`.
      T1–T4 turn **green**.
- [ ] **T6 — refactor** (still in `chatStatus.ts`): if it cleans up
      the call sites, expose a small `isReplayActive(state)` helper
      (taking `{ events, cursor, status, playing, loadedTraceId,
      messageId }`) so `Thread` doesn't have to re-derive the same
      condition. Pure, unit-tested in the same file.
      Tests still **green**.

### Component wiring (AC2, AC3, AC4 DOM half, AC5, AC6, AC7)

- [ ] **T7 — test first** (in a new
      `frontend/src/components/ChatPanel.replay.test.tsx`):
      `test_thread_bubble_shows_reasoning_label_at_think_cursor`
      (AC2). Render `<Thread bubble={status:null}>` with the chat
      store pre-seeded (one persisted message, `loadedTraceId ===
      that.id`) and the simulator pre-seeded (the canned trace,
      cursor at an `agent.think` event, `playing: true`); assert
      `getByText("Reasoning…")` (or `t.chat.stage.reason` resolved
      for the active language) is present and the persisted answer
      is NOT.
      → **red**.
- [ ] **T8 — test first**:
      `test_thread_bubble_streams_partial_answer_with_caret` (AC3).
      Same setup, cursor mid-`llm.generate` (a few progress events
      consumed); assert the partial assembled answer is rendered AND
      a `.caret` element exists.
      → **red**.
- [ ] **T9 — test first**:
      `test_thread_bubble_settles_to_persisted_answer_at_tail` (AC4
      DOM half). Cursor at `events.length - 1`, `playing: false`,
      `status: "done"`; assert the persisted answer is rendered and
      no `.caret` element exists.
      → **red**.
- [ ] **T10 — test first**: `test_only_loaded_turn_streams_during_replay`
      (AC5). Two persisted turns in the same conversation;
      `loadedTraceId === turn2.id`; cursor mid-replay of turn2;
      assert turn1's bubble still renders `turn1.message.answer`
      verbatim (and has no typing dots / caret), while turn2 follows
      the projection.
      → **red**.
- [ ] **T11 — test first**: `test_live_send_pending_path_is_unchanged`
      (AC6 — regression). Mock `streamChat` to push a few events +
      resolve; assert the in-flight `pending` bubble path (driven by
      `<App>`'s `bubble` prop into `Thread`) renders exactly as
      today (`<StageStatus>` then streamed answer + caret). The new
      code path must NOT activate while `pending !== null` (the
      persisted message hasn't been written yet, so the `Exchange`
      branch never sees it).
      → likely **green** today (regression guard).
- [ ] **T12 — test first**:
      `test_replay_falls_back_to_persisted_when_trace_expired` (AC7).
      Set `useChat.traceExpired = true`, `loadedTraceId =
      message.id`, simulator events `[]`; assert the bubble renders
      `message.answer` verbatim (no status state, no empty bubble).
      → **red** if T5 made `!hasEvents` fall through correctly →
      **green** at T13; useful as a defense-in-depth assertion.
- [ ] **T13 — implement (ChatPanel.tsx)**:
      - Lift the `bubble.kind === "answer" ? answer+caret :
        <StageStatus/>` snippet into a shared `BubbleBody({ bubble,
        t })` component (still in the same file).
      - In `Thread`, read `events`, `cursor`, `status`, `playing`
        from `useSimulator` and `loadedTraceId`, `traceExpired`
        from `useChat`. Compute `phase = activePhase(events,
        cursor)`, `view = deriveView(events, cursor)`,
        `isSettled = isFlowSettled({events, cursor, status,
        playing})`, `hasEvents = !traceExpired && events.length >
        0`. Pass them into each `<Exchange>` along with the
        existing `active` flag.
      - In `Exchange`, branch:
        - If `active && hasEvents && !isSettled`, the
          `<AgentMessage>` body is
          `<BubbleBody bubble={replayBubble(view, phase, {
            hasEvents, isSettled, persistedAnswer: message.answer
          })} t={t} />` — but skip the persisted-only short-circuit
          since the gate already cleared it; equivalently, just
          render `<BubbleBody bubble={pendingBubble(view, phase)}
          t={t} />`.
        - Else render `{message.answer}` exactly as today.
      - Replace the in-flight bubble's inline JSX with
        `<BubbleBody bubble={bubble} t={t} />` so the two paths
        share one renderer.
      T7–T12 turn **green**.

### Edge case: cancelled-run carryover (AC9)

- [ ] **T14 — test first** (in
      `frontend/src/store/useSimulator.replay-cancel.test.ts`, or
      folded into the existing cancel test):
      `test_replay_after_cancel_walks_cleanly` (AC9). Simulate a
      cancelled run (events partially populated, `status:
      "cancelled"`), then load a *different* finished trace via
      `loadTrace(other.events)`; press `togglePlay`; step the
      cursor through a few events; assert no leaked `view.streaming
      === true` from the cancelled run and the loaded trace's
      bubble walks AC1→AC3 as expected.
      → **red** or **green** depending on whether T13's branch
      reads `view.streaming` only from the current events (it
      should). Implementation already isolates the two — this is a
      regression guard.
- [ ] **T15 — implement (if needed)**: tighten any read that
      crossed the cancelled-run boundary. Likely **no code change**
      (the new branch reads from `useSimulator.events` which
      `loadTrace` replaces wholesale). If the test reveals a leak,
      fix it here.
      T14 turns **green**.

### Cross-cutting gates (AC11, AC12, AC13)

- [ ] **T16 — gate (no protocol drift)**: `git diff backend/app/schemas.py
      frontend/src/types/events.ts` is empty. (AC12)
- [ ] **T17 — gate (no new strings)**: `git diff
      frontend/src/i18n/strings.ts` is empty. (AC13)
- [ ] **T18 — gate (FE build)**: `cd frontend && npm run build` clean
      (tsc + vite). `npm test` (Vitest) green across the new + touched
      tests. (AC11 FE half)
- [ ] **T19 — gate (BE untouched)**: `ruff check .` clean and
      `pytest -q` green — neither expected to change, but run them
      to confirm the spec didn't accidentally touch the backend.
      (AC11 BE half)

### Memory + status

- [ ] **T20 — memory + status**: update `MEMORY.md` pointer for
      spec 050 to "DONE & green" with the test counts; flip
      `spec.md` `Status` to `done`. Note the file/line of the
      Exchange branch + the `replayBubble` helper for future
      navigators.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
      (AC1–AC10) or a CI gate (AC11–AC13).
- [ ] `npm run build` clean (`tsc --noEmit` + vite).
- [ ] `npm test` green (Vitest).
- [ ] `ruff check .` clean and `pytest -q` green (no backend touched,
      confirms it).
- [ ] Protocol mirror byte-equal: `backend/app/schemas.py` ↔
      `frontend/src/types/events.ts` unchanged.
- [ ] No new user-facing strings in `frontend/src/i18n/strings.ts`.
- [ ] `STAGE_TO_STATION` / `STAGE_TO_PHASE` / `readoutFor` /
      `renderDetail` exhaustive maps untouched.
- [ ] `spec.md` status updated to `done`.
- [ ] `MEMORY.md` pointer for 050 updated to reflect completion.
