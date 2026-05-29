# Spec: Replay also re-fills the chat bubble (status → streamed answer)

| | |
|---|---|
| **ID** | 050-replay-bubble-streaming |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> Closes the last asymmetry between **live** and **replay**: today the canvas,
> the LLM readout, the Inspector and the Agent drill-in all re-animate when the
> user presses ▶ or steps ◀ ▶ through a past turn, but the **chat bubble** of
> that turn keeps showing the final persisted answer from frame 1. This spec
> makes that one bubble track the paced cursor the same way the live bubble
> already does — typing-dots + phase label ("Reasoning…") while the answer is
> still empty, then the streamed answer with a caret, then the final text — so
> replay teaches the same story a live run does, just at the user's pace.

## Problem / motivation

Replay is supposed to be *the same projection*, only with a smaller cursor
(`deriveView` is pure; CLAUDE.md "Frontend rendering is a pure projection.").
And on the canvas it really is: stations animate, hops light up, the LLM block
fills in `streaming(n)` → `4.0k tok · $0.0019`, the Inspector's assembled
prompt + generated answer rebuild themselves, the Agent drill-in retypes
`view.answer`.

But the most prominent place — the chat bubble of the turn being replayed —
never moves. When the user steps from the start of a past turn:

- The canvas shows `agent.think` lit, hops animating, LLM block idle…
- …while the bubble already shows the full answer "Imagine que você tem
  5 maças…"

That breaks the pedagogical promise twice over:

1. **Live and replay diverge.** A first-time visitor learns the bubble types
   itself out during a live send (012-chat-flow-sync). On replay they expect
   the same animation; instead the bubble teleports to the answer.
2. **The "thinking" stages disappear.** The "● ● ● Reasoning…" status the
   live bubble shows while the agent is mid-`agent.think` is one of the most
   evocative things in the visualizer (it's where the "agent is doing
   something" feeling lives). It only shows up during a live send today —
   step/replay never re-surfaces it, even though every event needed to
   reconstruct it is already in `events.slice(0, cursor+1)`.

The fix is purely client-side and tiny: when the bubble being rendered belongs
to the turn whose trace is currently loaded on the canvas *and* the simulator
isn't settled at the tail, drive its body from `pendingBubble(view, phase)` —
the exact projection the live bubble uses (`chatStatus.ts:24`). When the
simulator is at the tail (no replay running, cursor at the end), bubbles
render the persisted answer exactly as today.

## Goals

- **Replay re-runs the bubble.** Pressing ▶ on a past turn (or stepping ◀ ▶
  manually) re-animates that turn's bubble the same way the live bubble
  animated during its original send: typing-dots + phase label while
  `view.answer` is empty, then the streamed answer with the blinking caret,
  ending at the final text when the cursor reaches the tail.
- **One projection, two cursors.** Live and replay both use
  `pendingBubble(view, activePhase(events, cursor))`. No new state, no new
  events — replay just feeds a smaller cursor. (CLAUDE.md: "Live streaming
  and step/replay are the exact same code path — replay is just a smaller
  cursor.")
- **Scoped to the loaded turn.** Only the bubble for the turn whose
  `loadedTraceId === message.id` re-animates. Older turns in the same
  conversation stay static (their bubbles still show `message.answer`) so
  the user can read them while replaying a different one.
- **Settled = persisted.** When the cursor is at the tail and nothing is
  playing/streaming, the bubble shows `message.answer` verbatim — pixel-for-
  pixel identical to today's "after the run" frame. No flicker, no off-by-
  one between the streamed reassembly and the persisted text.
- **No protocol change, no new strings.** Every string this needs (`t.chat.
  stage.*`, `t.chat.thinking`) already ships in `en` + `pt` from
  012-chat-flow-sync; `<StageStatus>` and the caret already exist in
  `ChatPanel.tsx`. This spec only wires them to a second cursor.

## Non-goals

- **Animating older turns' bubbles.** A conversation may have ten persisted
  turns; only the loaded one re-streams. Re-animating every bubble on every
  step would muddle the canvas-vs-chat mapping.
- **Adding a "replay this bubble" button on the bubble itself.** The
  controls live in the Timeline (▶ ⏮ ⏭ + scrubber). The bubble just
  follows.
- **Backend changes.** Nothing emits, persists or replays differently
  server-side. `GET /api/trace/{id}` and the SSE shape are untouched.
- **A new `Stage` / `Phase` / `TraceEvent`.** §1 protocol unchanged.
- **Touching the live optimistic bubble (`useChat.pending`).** Live sends
  keep the exact path they have today; this spec only changes how a
  *persisted* turn's bubble renders while that turn is the one loaded on
  the canvas.
- **Changing the "trace expired" path.** When `traceExpired` is true the
  bubble has no events to project from — it stays at `message.answer`,
  exactly as today.
- **Cancelled turns.** A cancelled run never persists a message, so there
  is nothing in `messages` to drive from this spec; the cancelled-bubble
  UX (016) is untouched.

## User-facing behavior

- **Click a past message → canvas loads its trace, bubble unchanged.**
  `loadTrace` settles the cursor at the tail (`useSimulator.ts:280-294`), so
  `pendingBubble`'s settled branch fires and the bubble shows
  `message.answer` exactly as today. No surprise on a quiet click.
- **Press ▶ → bubble rewinds with the canvas.** `togglePlay` resets the
  cursor (`-1` if at end) and starts ticking; the loaded turn's bubble
  immediately switches to the status state (`● ● ● Thinking…` /
  `● ● ● Reasoning…` etc., matching the phase the cursor is in) and then
  retypes the answer token-by-token with a caret as the cursor crosses
  `llm.generate` progress events.
- **Step ⏭ / ⏮ manually → bubble follows step by step.** Each click
  advances the cursor by one event; the bubble shows whatever
  `pendingBubble(view, activePhase(...))` projects at that cursor.
- **Pause mid-stream → bubble freezes at that token.** No timer means no
  state change; the bubble holds wherever the projection landed.
- **Scrubber drag back → bubble rewinds tokens.** Pure projection: a
  smaller cursor produces a shorter `view.answer`.
- **Cursor reaches the tail → bubble snaps to the persisted answer.** With
  `playing=false`, `status="done"` and `cursor===events.length-1`, the
  bubble renders `message.answer` (the settled branch). The streamed
  reassembly and the persisted text should be the same string; using the
  persisted source for the settled state avoids any reassembly drift.
- **Other (non-loaded) turns stay quiet.** Their `loadedTraceId !==
  message.id`, so they always render `message.answer`.
- **No new prose.** Status labels reuse the existing
  `t.chat.stage[phase]` / `t.chat.thinking` map; both ship en + pt from
  012.

## Acceptance criteria

### Projection

1. **AC1 — Loaded turn, cursor at `-1`, no answer yet → status bubble.**
   `pendingBubble(deriveView(events, -1), activePhase(events, -1))` returns
   `{kind: "status", phase: <first occurring or null>}` and the bubble
   renders `<StageStatus>` (typing dots + label). Unit-tested against a
   canned trace.

2. **AC2 — Loaded turn, cursor between `agent.think` start and end →
   bubble reads `Reasoning…`.** Stepping into the reasoning phase puts
   `activePhase` at `"reason"`, and the bubble renders the localized
   `t.chat.stage.reason` string ("Reasoning…" / "Raciocinando…"). Verified
   in React Testing Library by rendering `Thread`/`Exchange` with a frozen
   trace + cursor and asserting on the text.

3. **AC3 — Loaded turn, cursor mid-`llm.generate` progress → bubble shows
   the partial streamed answer + caret.** With `view.answer` non-empty and
   `view.streaming === true`, the bubble renders `view.answer` followed by
   the `▍` caret span, *not* `message.answer`. Component test asserts on
   the partial text and the presence of `.caret`.

4. **AC4 — Loaded turn, cursor at the tail of a finished run → bubble
   shows `message.answer`, no caret.** Once the cursor reaches
   `events.length - 1`, `status === "done"`, and `playing === false`, the
   bubble reverts to the persisted answer. Settles cleanly — no flicker,
   no caret left behind.

### Scope

5. **AC5 — Non-loaded turns never re-animate.** Given a conversation with
   two persisted turns and `loadedTraceId === turn2.id`, turn1's bubble
   always renders `turn1.message.answer` regardless of `playing`, cursor
   position or `view`. Asserted by rendering both bubbles in the same
   thread and stepping the cursor.

6. **AC6 — Live send is unaffected.** While `useChat.pending !== null`,
   the optimistic in-flight bubble keeps the exact rendering it has today
   (it already uses `bubble: PendingBubble` from `App.tsx`). The new
   replay path only activates for persisted messages with
   `m.id === loadedTraceId`. Regression-tested by sending a message with a
   mock SSE and asserting the pending bubble path still owns the
   animation.

### Edge cases

7. **AC7 — `traceExpired` falls back to persisted.** When the trace was
   evicted (`useChat.traceExpired === true`), there are no events to
   project from; the loaded turn's bubble renders `message.answer`
   exactly as today (no broken status state, no empty bubble). Component
   test sets `traceExpired` and asserts on the persisted text.

8. **AC8 — Empty `events` is safe.** A bubble loaded with zero trace
   events (extreme fallback) renders `message.answer`; the new branch
   short-circuits when `events.length === 0`. Asserted by a unit test on
   the projection helper.

9. **AC9 — Cancelled runs do not poison other turns.** A cancelled live
   run never persists a message; opening a past turn afterwards and
   replaying it works exactly per AC1–AC4 (no leaked `pending`, no
   `view.streaming` stuck `true`). Asserted in the simulator store test
   with the cancel + select-message sequence.

10. **AC10 — Manual ◀ ▶ steps re-render frame by frame.** Stepping the
    cursor one event at a time produces a series of bubbles that walk
    monotonically from `status:<phase>` → `answer:partial` →
    `answer:final`. Asserted by snapshotting the bubble's rendered text
    across a stepped sequence of cursors.

### Cross-cutting

11. **AC11 — Constitution gates green.** `ruff check .` clean (no
    backend touched); `pytest -q` green (no backend touched); `npm run
    build` (`tsc --noEmit` + build) clean; `npm test` (Vitest) green
    including the new component tests.

12. **AC12 — No protocol drift.** `backend/app/schemas.py` ↔
    `frontend/src/types/events.ts` byte-identical to pre-spec — no new
    `Stage`, no new `Phase`, no new `TraceEvent` field.

13. **AC13 — No new user-facing strings.** Every label used by the new
    path resolves to existing `t.chat.stage[phase]` /
    `t.chat.thinking` entries (already bilingual since 012). Grep
    asserts no new keys in `i18n/strings.ts`.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.** No new field, no new shape.
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` (§6): **unchanged.**
- Cloud map (§5): **unchanged** (no new tier/station).
- New endpoints: **none.**
- DB schema: **unchanged.**
- i18n (§4): **no new strings.** Reuses `t.chat.stage[phase]` and
  `t.chat.thinking` (both already en + pt from 012-chat-flow-sync).

## Open questions (clarify before planning)

- [x] **Which bubble re-animates — all of them, the latest, or the
  loaded one?** → **The loaded one** (`loadedTraceId === message.id`).
  All-of-them muddles the chat / canvas mapping; latest-only breaks the
  natural "click an old message → press ▶ → watch it again" path.
- [x] **At the tail of replay, drive from `view.answer` or from
  `message.answer`?** → **`message.answer`**. The reassembled tokens
  *should* equal the persisted text, but using the persisted source for
  the settled state avoids any token-reassembly drift (e.g. whitespace
  normalization differences) and gives byte-for-byte parity with today.
- [x] **What about a live send happening on a different conversation?**
  → Not applicable. There is one active simulator instance; a live send
  always targets the active conversation and uses the `pending` path.
  Switching conversations resets the simulator (`openSession` → `reset`)
  before any replay state can apply.
- [x] **Do we need new i18n strings?** → **No.** `t.chat.stage[phase]`
  and `t.chat.thinking` already cover every projection state, in both
  languages.
- [x] **Should we re-trigger the typing-dots animation each step?** →
  The `<TypingDots>` component already runs its `blink` keyframe
  continuously while mounted — nothing extra to do.

## Out of scope / deferred

- Re-animating older (non-loaded) bubbles in the same thread.
- A "replay just this bubble" button on the bubble.
- Persisting / replaying the *streaming cadence* of the original run
  (we re-stream at the replay tick, not at the original wall-clock
  speed). Today's replay is paced by `LIVE_STEP_MS` / `togglePlay`'s
  280 ms timer; matching real wall-clock pacing is a future spec.
- Surfacing the streamed answer in the conversation HUD totals
  mid-replay — the HUD shows conversation-cumulative real numbers
  (018), independent of the playhead, and that stays.
