# Spec: Chat bubble stays in lockstep with the paced flow

| | |
|---|---|
| **ID** | 012-chat-flow-sync |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> 009 paced the **canvas** so the answer never pre-empts the flow. The **chat
> panel** was left out: it swaps the live bubble for the persisted answer the
> instant the *network* finishes, so the full answer appears in the chat while the
> playhead is still walking the stations. Make the chat bubble follow the same
> paced playhead — show the live **execution status** while the flow runs, stream
> the answer in sync, and only reveal the persisted message once the flow settles.

## Problem / motivation

009-live-pacing made `deriveView(events, cursor).answer` paced: the canvas walks
the stations and the answer text fills in only when the playhead reaches the LLM.
But the **chat** does not honor that playhead. In `useChat.send()` the live
`pending` bubble is replaced by the persisted message (`listMessages` →
`set({ messages, pending: null })`) the moment the SSE stream **finishes on the
network** — which happens in well under a second, long before the paced playhead
has drained. Result (reported, with screenshot): the chat shows the complete
answer ("…is 48.") while the canvas is still at `agent.think` / `prompt assembled`.

The chat and the canvas tell two different stories at the same time. The whole
lesson of the Simple scenario — *watch the request travel* — is undercut because
the answer is already sitting in the chat before the journey is over.

## Goals

- The chat bubble is driven by the **same paced playhead** as the canvas, so the
  two are never out of step.
- While the flow runs (before any answer text), the bubble shows a **live
  execution status** that names the current pipeline stage — Routing →
  Retrieving → Reasoning → Calling tools → Generating — synced to the playhead.
- In **stream mode** the answer then types out **word-by-word**, in sync with the
  flow returning each token (it already derives from the cursor — 009).
- In **batch mode** the answer appears **all at once at the end**, when the
  playhead reaches the answer stage.
- The persisted message (with its **Sources** disclosure and real timestamp)
  replaces the live bubble **only once the flow has settled** (the playhead has
  drained to the end of a finished run) — never while it is still animating.
- The flow still **starts immediately** on send (unchanged — `beginRun` already
  resets and starts the ticker the moment the message is sent).

## Non-goals

- **No server-side change.** Same fast, real pipeline (constitution §3); this is a
  pure client-side projection-over-time concern (§7), like 009.
- **No new `Stage`/`Phase`/`TraceEvent`.** The execution status reuses the existing
  timeline-phase taxonomy (004) projected from the cursor; the protocol is
  unchanged (§1, §6).
- **No new station / hop / tier** (§5) and no change to `deriveView`'s output for a
  given cursor.
- Not pacing the **PDF-upload** stream — that flow shows no chat answer; out of
  scope (same as 009).

## User-facing behavior

Send a message in the Simple scenario. The flow starts at once. In the chat, the
agent bubble shows a **status** that tracks the journey: "Routing…", then
"Retrieving…", "Reasoning…", "Calling tools…", "Generating…", each in step with
the lit station on the canvas. In **stream** mode the status gives way to the
answer typing out word-by-word as the model streams; in **batch** mode the whole
answer appears at once when the playhead reaches the answer stage. When the flow
**finishes draining**, the live bubble is replaced by the persisted exchange — same
text, now with its **Sources** disclosure and timestamp. The answer is never ahead
of the flow.

**New user-facing text (ships en + pt, constitution §4):** a short running-status
label per pipeline stage (gerund form, e.g. "Retrieving…" / "Recuperando…"),
parallel to the existing `timeline.phases` noun labels. The generic "Thinking…" /
"Pensando…" string (already present) is the fallback before the first stage.

## Acceptance criteria

> Numbered, testable — **frontend Vitest** over pure helpers plus one store-glue
> test. No reliance on wall-clock timers in assertions (drive state directly).

1. **AC1 — status until the answer, then the answer.** A pure projector of the
   chat bubble, given `events`, the paced `cursor`, and the derived view, returns a
   **status** descriptor (carrying the current timeline phase from
   `activePhase(events, cursor)`) whenever the derived `answer` is empty, and an
   **answer** descriptor (text + streaming flag) once `answer` is non-empty.
2. **AC2 — bilingual stage labels.** A running-status label exists for **every**
   timeline phase in **both** `en` and `pt` (key sets identical, no blank values) —
   the §4 gate for the new prose.
3. **AC3 — answer never pre-empts the flow (stream).** Replaying a stream run
   through the projector at every cursor: while the derived `activeStation` is a
   pre-LLM station the bubble is a **status** (answer empty); it becomes an
   **answer** only once the cursor has reached the token stream — mirrors 009 AC3
   at the chat-bubble level.
4. **AC4 — batch reveals the whole answer at the stage, not before.** For a
   batch-shaped log (answer present only on the `generate`/`respond` END, no token
   progress), the bubble is a **status** for every cursor before that END and an
   **answer** carrying the **complete** text at/after it.
5. **AC5 — `isFlowSettled` predicate.** A pure predicate over `{ events, cursor,
   status, playing }` is `false` when `events` is empty, when `status` is
   `streaming`, when `playing` (replay in progress), or when `cursor` has not
   reached the tail; and `true` exactly when the run is over (`status !==
   streaming`), no replay is running, and the playhead has drained to the tail.
6. **AC6 — the chat holds the persisted swap until settled.** With `chatApi`/`sse`
   mocked, after `streamChat` resolves, `useChat.send()` keeps `pending` non-null
   and does **not** apply the persisted `messages` while the simulator is not
   settled; once the simulator reaches a settled state the swap happens
   (`pending === null`, `messages` applied). A burst-completed network round-trip
   no longer clears the live bubble early.

## Protocol / stage impact

§1 & §6 — **none.**

- New/changed `Stage`(s): **none.**
- Mirror in `frontend/src/types/events.ts`: **n/a.**
- Station mapping in `stations.ts`: **unchanged.**
- New tier/station/hop (§5): **none** → cloud map unaffected.

## Clarifications (resolved 2026-05-26)

- [x] **Q — when does the answer text appear?** Mode-dependent: **stream** types it
  word-by-word in sync with the flow returning each token; **batch** reveals it
  whole at the end. Both fall out of driving the bubble from the paced cursor.
- [x] **Q — what shows before the answer?** A **live execution status** naming the
  current stage (chosen over a bare typing indicator), reusing the timeline-phase
  taxonomy, bilingual en/pt.
- [x] **Q — when is the persisted message revealed?** Only once the flow **settles**
  (playhead drained to the end of a finished run), so the chat never jumps ahead.

## Out of scope / deferred

- **Manual-scrub-park edge:** if the user manually scrubs to a middle frame during
  a finished-but-not-yet-drained run and never reaches the tail, the persisted swap
  waits until they reach the end. Acceptable — the displayed paced answer stays
  in-sync; a fancier "seen at least once" latch is deferred.
- Pacing the PDF-upload stream (no chat answer to sync).
- Any per-stage iconography in the chat status beyond the label + spinner.
