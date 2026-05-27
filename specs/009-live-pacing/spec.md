# Spec: Live pacing (the journey animates, the answer doesn't pre-empt it)

| | |
|---|---|
| **ID** | 009-live-pacing |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> In stream mode the structural journey through the stations is imperceptible:
> the answer streams while the canvas has already teleported to the LLM. Make the
> live run *paced* so the packet visibly walks station-by-station, and the
> streamed answer only fills in once the flow reaches the LLM — never before.

## Problem / motivation

The whole point of the Simple scenario is to **show the sequence**: a request
travels frontend → backend → db → agent → rag/mcp → llm → back. Today that
sequence is invisible at runtime. The structural stages all fire on the server in
**milliseconds** and arrive over SSE in one burst; the store snaps the playhead to
the live tail on every event, so the canvas jumps straight to the LLM. The only
thing with perceptible wall-clock duration is the **real OpenAI token stream**.

Net effect, reported by users: *"it thinks and answers before the flow even
starts."* The chat and canvas are technically in sync (both derive from the same
cursor), but the sync point is the tail — the LLM — so the lesson of the journey
is lost and only the answer is visible. A learner never sees the agent *reach* the
brain; they only see it speak.

## Goals

- In **live (stream) mode**, the playhead advances toward the live tail at a
  **paced cadence** so each station change is on screen long enough to read — the
  packet visibly walks the route instead of teleporting.
- The **streamed answer stays in lockstep with the playhead** (it already derives
  from the cursor): the answer text is empty until the flow reaches the LLM, then
  types out as tokens arrive. The answer can never be visible "before the flow".
- **Token typing keeps arrival speed** — tokens are not artificially slowed; once
  the playhead reaches `llm.generate`, queued tokens flush so the answer types at
  the model's real pace, not one-per-tick.
- **Replay, step, and the guided tour are untouched** — pacing applies only to the
  live, following playhead; manual scrubbing and the tour keep today's behavior.
- A finished run still **settles** on the final frame (no station left pulsing),
  exactly as `deriveView` already defines "finished".

## Non-goals

- **No server-side pacing / artificial sleeps.** The backend stays as fast and as
  real as today (constitution §3); pacing is a pure client-side projection concern
  (§7), never a fake delay injected into the pipeline.
- **No new `Stage`/`Phase`/`TraceEvent`.** This is purely how the existing event
  log is *projected over time*; the protocol is unchanged (§1).
- **No change to `deriveView`'s output** for a given cursor — only *which cursor*
  the live playhead sits at over time changes.
- No configurable pace UI / slider — a single sensible cadence (deferred).

## User-facing behavior

Send a message in the Simple scenario. The send button pings, then the packet
**visibly travels**: Frontend lights, then Backend, then the App Database (history
read), then the Agent, then RAG and the MCP tools, then the LLM — each for a beat.
The chat shows the typing indicator during the journey; the answer begins typing
**only when the LLM station lights up**, then streams to completion at the model's
real speed. When the run ends the canvas settles on the final frame. Stepping the
timeline, scrubbing, replay and the guided tour behave exactly as before.

*(No new prose strings — this spec adds no user-facing text.)*

## Acceptance criteria

> Numbered, testable. These are **frontend Vitest** tests over a pure pacing
> reducer + the store glue (no reliance on wall-clock timers in assertions).

1. **AC1 — paced advance, no skipping.** Given a buffer of consecutive structural
   events all already present, the live pacing reducer advances the cursor **by at
   most one structural event per pace interval** and visits **every** structural
   index in order (never jumps straight to the tail). Driving it with `now`
   advanced one interval at a time yields the cursor sequence `k, k+1, k+2, …`.
2. **AC2 — tokens flush at arrival speed.** Consecutive `llm.generate/progress`
   (token) events carry **no per-event dwell**: when the cursor sits just before a
   run of token events, a single pace step advances past **all** currently-buffered
   tokens to the live tail (so typing tracks the model, not the tick).
3. **AC3 — the answer never pre-empts the flow.** Replaying a full run through the
   pacing reducer, at every intermediate cursor whose derived `activeStation` is a
   pre-LLM station, `deriveView(events, cursor).answer` is `""`; the answer becomes
   non-empty only once the cursor has reached the `llm` station.
4. **AC4 — `pushTrace` no longer snaps.** In live (`streaming`, `following`) mode,
   appending a trace event grows `events` but **does not** move `cursor` to the tail
   synchronously (the paced ticker owns cursor advancement); a burst of N events
   does not jump the cursor by N.
5. **AC5 — replay/step/tour unaffected.** With `following === false` (manual scrub,
   replay, or an active tour) the pacing ticker makes no cursor changes — a
   regression guard that pacing is scoped to the live, following playhead.
6. **AC6 — settled end frame.** After the terminal `backend/end` event the paced
   playhead drains to the tail and the run settles (`activeStation === null`,
   `streaming === false`) — the existing `derive.test.ts` end-state still holds.

## Protocol / stage impact

§1 & §6 — **none.**

- New/changed `Stage`(s): **none.**
- Mirror in `frontend/src/types/events.ts`: **n/a.**
- Station mapping in `stations.ts`: **unchanged.**

## Clarifications (resolved 2026-05-26)

- [x] **Q — pace source: client-side projection, not server sleeps.** Pacing is a
  pure frontend concern (constitution §3 everything-is-real + §7 pure projection):
  the backend stays untouched; the client just walks the existing event log over
  time. Chosen over injecting delays server-side (which would fake the pipeline).
- [x] **Q — tokens not slowed.** Only *structural* stage changes get a minimum
  dwell; token progress events fast-forward, so the answer types at the model's
  real speed once reached.

## Out of scope / deferred

- A user-facing **pace control** (slow / normal / fast).
- Pacing the **PDF-upload** stream (chunk → embed → store) — same machinery could
  apply later; this spec targets the chat run.
