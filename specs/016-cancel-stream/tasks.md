# Tasks: Cancel an in-flight run

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Clarify resolved** — server-aware cancel · discard the turn · button only (no Esc)
> (`spec.md`, 2026-05-27). Touches the backend (`/api/chat`) — schedule apart from 017.

## Phase 1 — Simulator cancel (AC3)

- [x] **T1 — test first**: `frontend/src/store/useSimulator.cancel.test.ts` — after
  `cancelRun()` mid-stream, `status === "cancelled"` and `events`/`cursor` are preserved
  (replay/step still work); a subsequent `beginRun()` resets cleanly.
- [x] **T2 — implement**: add `"cancelled"` to `Status`; add `cancelRun()` (abort the
  controller, stop the live ticker, set `status: "cancelled"`, keep events/cursor) in
  `frontend/src/store/useSimulator.ts`. Confirm `isFlowSettled` treats it as terminal.

## Phase 2 — Chat terminal state (AC1, AC2)

- [x] **T3 — test first**: `frontend/src/store/useChat.cancel.test.ts` — `cancel()`
  aborts the active run, sets `sending: false` + `cancelled: true`, throws nothing, and
  does **not** reload/show a message; `cancel()` is a no-op when no run is active.
- [x] **T4 — implement**: add `cancelled: boolean` + `cancel()` to
  `frontend/src/store/useChat.ts` (delegates to `cancelRun()`, clears `pending`); reset
  `cancelled` on `send`/`openSession`/`newChat`.

## Phase 3 — Server-aware cancellation (AC4, AC6)

- [x] **T5 — test first**: `backend/tests/test_cancel.py` (`@pytest.mark.openai`) — open
  the streaming `/api/chat`, read the first trace events, **disconnect early**, then
  assert `store.list_messages(session)` has **no** message for that turn (discard) and
  no 500 / no hang.
- [x] **T6 — implement**: in `backend/app/main.py` `event_stream`, detect early close
  (no `DONE` sentinel) and `task.cancel()` + await-with-suppression instead of awaiting
  to completion. Ensure `emitter.close()` can't deadlock on the cancel path (non-blocking
  final put / drop). Keep `except Exception` *not* catching `CancelledError`.

## Phase 4 — i18n + UI (AC5)

- [x] **T7 — test first**: i18n parity — `chat.cancel` + `chat.cancelled` exist in en
  **and** pt.
- [x] **T8 — implement**: add the strings; create `frontend/src/components/CancelButton.tsx`
  (shown only while a run is active) and mount it near the composer in `ChatPanel.tsx`
  with the transient "run cancelled" note. Tokens only (theme guard).

## Phase 5 — Verify & refactor

- [x] **T9 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (incl. the cancel
  test with a key) · `npm test` · `npm run build` — all green. No protocol change.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC6)
- [x] Backend cancels the producer before `db.write` ⇒ cancelled turn not persisted
- [x] Partial trace remains on the canvas (replay/step works) after cancel
- [x] No protocol change; `events.ts` untouched; `"cancelled"` is UI state only
- [x] `chat.cancel` + `chat.cancelled` exist in en **and** pt
- [x] `spec.md` status updated to `done`
