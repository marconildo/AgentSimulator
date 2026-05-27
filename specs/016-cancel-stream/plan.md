# Plan: Cancel an in-flight run

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> **Server-aware** cancel (clarify revised the original client-only non-goal): the
> client aborts the SSE request **and** the backend cancels the producer task. No new
> `Stage`/`Phase`/`TraceEvent`; the "cancelled" marker is client UI state only.

## Approach

Three moves, all on existing plumbing:

1. **Client abort (already minted).** `useSimulator.beginRun()` already creates a
   module-level `AbortController` and returns its `signal`. Add `cancelRun()` to the
   simulator: it `abort?.abort()`s, stops the live ticker, and sets `status:
   "cancelled"` **without** clearing `events`/`cursor` — so the partial trace stays on
   the canvas, replayable/step-able (AC3). Add `"cancelled"` to the `Status` union.
2. **Chat terminal state.** Add `cancel()` to `useChat`: it calls
   `useSimulator.getState().cancelRun()`, clears `pending`, sets `sending: false` and a
   transient `cancelled: true` (cleared on the next `send`/`openSession`/`newChat`). The
   existing `send()` already handles the abort cleanly — `streamChat` throws
   `AbortError`, caught by `if (isAbort(err)) return;`, so we never reach the post-stream
   reload (`listMessages`) → the discarded turn is never shown (AC2/AC4). No new error.
3. **Server-aware cancellation.** In `main.py`'s streaming `event_stream`, when the
   client disconnects (the generator is closed before the `DONE` sentinel), **cancel the
   producer task** instead of awaiting it to completion. The producer's `await
   run_agent(...)` raises `CancelledError` (a `BaseException`, so it skips the
   `except Exception` clause and hits the `finally`, which `trace_store.save`s the
   *partial* trace and closes the emitter). Because cancellation happens **before**
   `db.write` (which runs after `run_agent`), the conversation is **never persisted** →
   discarded (AC4, AC6).

**Cancel UI.** A `CancelButton` near the composer, shown only while a run is active
(`sending` / simulator `status === "streaming"`), wired to `useChat.cancel()` (AC1).
No `Esc` binding (clarify: button only).

*Alternatives considered:* (a) client-only cancel — rejected in clarify: the backend
producer runs to completion and persists the full turn, so "cancel" wouldn't interrupt
anything (hollow lesson). (b) a "cancelled" `Stage`/event from the backend — rejected:
the producer is being cancelled, so emitting cleanly is fragile; the marker is pure
client UI state, no protocol change.

## Affected files

**Backend**
- `backend/app/main.py` — `event_stream`: track whether the `DONE` sentinel was seen;
  on early close (disconnect), `task.cancel()` + `await` (suppressing `CancelledError`)
  instead of always `await task`. Ensure `emitter.close()` can't deadlock with no
  consumer (see Risks).
- *(maybe)* `backend/app/trace.py` — only if `emitter.close()`'s queue put needs to be
  non-blocking on the cancel path.

**Frontend**
- `frontend/src/store/useSimulator.ts` — add `"cancelled"` to `Status`; add `cancelRun()`
  (abort + stop ticker + `status: "cancelled"`, keep `events`/`cursor`).
- `frontend/src/store/useChat.ts` — add `cancelled: boolean` + `cancel()`; reset
  `cancelled` on `send`/`openSession`/`newChat`.
- `frontend/src/components/CancelButton.tsx` *(new)* — visible only during an active
  run; calls `cancel()`.
- `frontend/src/components/ChatPanel.tsx` (or the composer area) — mount `CancelButton`;
  render the transient "run cancelled" note.
- `frontend/src/lib/chatStatus.ts` — `isFlowSettled` already returns `false` only for
  `streaming`; confirm `"cancelled"` is treated as settled (terminal) so nothing hangs.
- `frontend/src/i18n/strings.ts` — `chat.cancel` + `chat.cancelled` (en + pt).

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed; `events.ts` untouched. The
`"cancelled"` value is UI state in the simulator store, not a protocol enum.

## Data model changes

None — the point is to **not** write. (Edge: `ensureSession` may already have created an
empty session row for a brand-new draft whose first turn is cancelled; the *message* is
never written. Acceptable; noted in Risks.)

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `chat.cancel` | Cancel | Cancelar |
| `chat.cancelled` | Run cancelled | Execução cancelada |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | cancel is a no-op when idle; available only while a run is active | `frontend/src/store/useChat.cancel.test.ts` *(new)* |
| AC2 | `cancel()` aborts the run signal and leaves `sending: false`, `cancelled: true`, no throw | `useChat.cancel.test.ts` |
| AC3 | after `cancelRun()`, simulator keeps `events`/`cursor` (status `cancelled`); a fresh `beginRun` starts clean | `frontend/src/store/useSimulator.cancel.test.ts` *(new)* |
| AC4 | a disconnect mid-stream persists **no** message for that turn (`list_messages` empty) | `backend/tests/test_cancel.py` *(new, `@pytest.mark.openai`)* |
| AC5 | `chat.cancel` + `chat.cancelled` exist in en **and** pt | i18n parity test |
| AC6 | disconnecting the SSE cancels the producer task (run does not finish/persist) | `backend/tests/test_cancel.py` |

The `CancelButton` rendering is guarded by `tsc`/`npm run build` + manual verify.

## Risks / trade-offs

- **Cancel-path deadlock.** When the consumer breaks out of the queue loop, the
  producer's `finally`/`emitter.close()` must not block forever putting a final sentinel
  on a bounded queue with no reader. Mitigate: cancel the task (its `await` unwinds), and
  if `close()` enqueues, use a non-blocking put / drop on the cancel path. A test pins no
  hang.
- **`CancelledError` is a `BaseException`.** The producer's `except Exception` must keep
  *not* catching it (so cancellation propagates to `finally`); a stray `except
  BaseException` anywhere would break discard. Verified by the no-persist test.
- **Empty session shell.** A cancelled first-turn draft may leave a sessionless-message
  row (created by `ensureSession`). The *message* is discarded (the AC); the empty
  session is a pre-existing lazy-creation edge — documented, not addressed here.
- **Backend overlap with 017.** Both touch `main.py`; schedule them in different waves
  (016 is no longer pure-frontend).
