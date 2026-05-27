# Spec: Cancel an in-flight run

| | |
|---|---|
| **ID** | 016-cancel-stream |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

While a run is streaming, the only option is to **wait it out**. There is no way to
interrupt it. Conceptually this is a real lesson: streams must be cancellable and long
agent runs must be interruptible — a basic of operating an agent. The store already
mints an `AbortSignal` per run (`beginRun`), so the plumbing to abort exists; the UI
just never exposes it.

## Goals

- Give the user a **Cancel control during an active run** that aborts the SSE request
  and settles the UI into a clean, non-error terminal state.
- Make a subsequent send work normally (no stuck "sending" state).

## Non-goals

- ~~Not changing the agent loop or adding server-side cancellation semantics beyond the
  client closing the connection.~~ **Revised in clarify (2026-05-27):** cancel is now
  **server-aware** — the backend detects the client disconnect and **cancels the
  producer task**, genuinely interrupting the in-flight run (so the turn is discarded,
  not persisted). The agent's *control flow* is unchanged; we only cancel it.
- Not a pause/resume of a run (cancel is terminal).

## User-facing behavior

- During a streaming run, a **Cancel** affordance appears (near the chat input /
  composing area); outside an active run it is absent.
- Clicking Cancel stops the stream immediately. Whatever trace already arrived stays on
  the canvas and is **replayable**; the chat shows the run as cancelled (not an error).
- Bilingual control label + cancelled-state text.

## Acceptance criteria

1. **AC1** — A cancel action exists and is **only enabled while a run is active**
   (status streaming/sending); it is a no-op otherwise.
2. **AC2** — Invoking cancel **aborts the in-flight request** via the run's existing
   `AbortSignal` and transitions the chat store out of `sending` into a terminal
   **cancelled** (non-error) state, without throwing or leaving `sending: true`.
3. **AC3** — After cancel, the partial trace that arrived **remains in the simulator**
   (events + cursor preserved, replay/step works), and a new `send` starts cleanly.
4. **AC4** — The cancelled turn is **discarded**: because the backend cancels the
   producer **before `db.write`**, no message is persisted for it (a reload of the
   conversation does not show it). No 500; the run reaches a clean terminal state.
5. **AC5** — The cancel control label and the cancelled status read in **both en/pt**.
6. **AC6** — Cancellation is **server-aware**: a client disconnect mid-stream cancels
   the in-flight producer task (the agent run does not continue to completion), proven
   by a test that disconnects and asserts the turn was not persisted.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. The "cancelled" marker is **client UI state** (a new
  `"cancelled"` value in the simulator's `Status` union) — not a protocol `Phase`/`Stage`.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no event-protocol change).
- Station it maps to in `stations.ts`: **n/a**.
- **Backend behavior change (no new Stage):** `event_stream` cancels the producer task
  on client disconnect instead of awaiting it to completion.

## Clarified (2026-05-27)

- [x] **Partial persistence** → **discard.** The cancelled turn is not persisted (the
  backend is cancelled before `db.write`).
- [x] **Keyboard** → **button only.** No `Esc` binding (avoids clashing with overlay-
  close and other `Esc` uses).
- [x] **Server awareness** → **server-aware.** The backend detects the disconnect and
  cancels the producer task (genuinely interrupts the run). Revises the original
  client-only non-goal; recorded above.

## Out of scope / deferred

- Cancelling a batch-mode run (batch returns one response; cancel is a streaming notion).
- Graceful "stop after current tool" semantics.
