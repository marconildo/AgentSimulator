# Plan: Replay also re-fills the chat bubble (status → streamed answer)

> Pure-projection wiring on top of what already exists. No backend, no
> protocol, no new strings. The change is a single conditional inside
> `Exchange` plus a small projection helper, all driven by state the
> simulator + chat stores already publish.

## Approach

Today the chat panel has two distinct rendering paths:

- **Live (in-flight) bubble** — `ChatPanel.tsx:376-396`, gated by
  `useChat.pending`. Renders `<StageStatus phase={...} />` or
  `{bubble.text}` + `<span className="caret">▍</span>` based on
  `bubble: PendingBubble` (`chatStatus.ts:24`), which `App.tsx:159`
  computes from `pendingBubble(view, activePhase(events, cursor))`.
- **Persisted bubble** — `Exchange` (`ChatPanel.tsx:469-519`), renders
  `{message.answer}` verbatim, no projection awareness.

We give `Exchange` a third state, exactly between the two: when this
message is **the one whose trace is currently loaded onto the canvas**
(`message.id === loadedTraceId`) AND the simulator is **not settled at
the tail** (i.e. the cursor is moving or stopped mid-trace), render the
bubble body using `pendingBubble(view, phase)` — the same projection
the live bubble already uses. Otherwise (settled, or a non-loaded
turn), render `{message.answer}` exactly as today.

The "not settled" gate reuses the existing `isFlowSettled` helper
(`chatStatus.ts:35`) — same semantics that already decides when the
live bubble can hand off to the persisted message after a run. We
extend `isFlowSettled` (or wrap it in a new `isReplayActive` view-level
predicate) so it returns *true* whenever the simulator is "frozen at
the tail of a finished run" — which is precisely the frame on which
the persisted answer should appear.

Three concrete moves:

1. **A small new projection helper, `replayBubble`**, in
   `lib/chatStatus.ts`:
   ```ts
   replayBubble(view, phase, hasEvents, isSettled, persistedAnswer)
     -> string | { stage: ReactNodeShape }  // or just the PendingBubble
   ```
   The exact shape: it returns either `{ kind: "answer", text:
   persistedAnswer, streaming: false }` (when settled or no events) or
   `pendingBubble(view, phase)` (when replay is mid-flight). One pure
   function, three branches, fully unit-testable. Lives next to
   `pendingBubble` so the two projections stay together.

2. **`Exchange` accepts a per-message `replay` prop** with everything
   it needs to render that branch: `view`, `phase`, `hasEvents`,
   `isSettled`, and a boolean `active` (already passed today as
   `message.id === loadedTraceId`). When `active && !isSettled &&
   hasEvents`, body = `pendingBubble(view, phase)` rendered with the
   existing `<StageStatus>` / answer-with-caret pair (lifted from
   `Thread`'s in-flight block, see step 3). Otherwise body =
   `{message.answer}`.

3. **Hoist the `<StageStatus> / answer+caret` snippet into a shared
   `BubbleBody` component** (still in `ChatPanel.tsx`). Both the
   in-flight bubble and the replay-active bubble call it; the live
   bubble's call site doesn't visibly change. This avoids duplicating
   the typing-dots markup and keeps the two paths in lockstep — they
   share the exact same `PendingBubble` rendering.

That's all. Live sends keep using `bubble: PendingBubble` from
`App.tsx`; replay reuses the same projection inside `Exchange`. The
canvas, Inspector, AgentDetail, LLM readout — all unchanged.

### Alternatives considered + rejected

- **Drive the *live* `pending` bubble from `loadedTraceId` too.** Means
  removing `useChat.pending` and inferring the in-flight state from
  the simulator. Larger refactor, no UX gain (the live bubble already
  works). Rejected — orthogonal.
- **A new store flag `replayingMessageId`** that mirrors
  `loadedTraceId` plus "is playing or scrubbed". Adds state already
  derivable from `playing` + `cursor` + `loadedTraceId`. Rejected for
  YAGNI.
- **Drive the bubble from `view.answer` even when settled.** Avoids
  the dual-source split (replay vs persisted) but creates a real risk:
  token reassembly may differ from the persisted text in subtle ways
  (whitespace, edge tokens). Rejected — settled = persisted gives
  byte-for-byte parity with today and avoids any drift complaint.

## Affected files

**Frontend code**
- `frontend/src/lib/chatStatus.ts`:
  - New `replayBubble(view, phase, opts)` helper or extend
    `isFlowSettled` to take the (`events.length`) directly and expose
    a tiny `isReplayActive(...)` predicate. Either way: one pure,
    unit-testable function added next to the existing two.
- `frontend/src/components/ChatPanel.tsx`:
  - Lift the in-flight bubble body (`<StageStatus>` / answer + caret)
    into a shared `BubbleBody({ bubble })` component (still in this
    file; no new file).
  - `Thread`: pass `view`, `phase`, `hasEvents`, `isSettled` into
    each `<Exchange>` (currently has `active`). Read them from
    `useSimulator` + the same `pendingBubble` inputs already computed
    upstream — `App.tsx` already passes `bubble`, and the missing
    pieces are 3 store reads + a derived boolean.
  - `Exchange`: branch — if `active && replayActive`, render
    `<BubbleBody bubble={pendingBubble(view, phase)} />`; otherwise
    render `{message.answer}` exactly as today (`message.answer` stays
    inside `<AgentMessage>`).

**Frontend tests (new)**
- `frontend/src/lib/chatStatus.replay.test.ts` — unit-tests the new
  `replayBubble` projection across cursor positions and settled state
  (AC1, AC2, AC3, AC4, AC8, AC10).
- `frontend/src/components/ChatPanel.replay.test.tsx` — React Testing
  Library, renders `<Thread>` against a canned trace + cursor +
  `loadedTraceId`. Asserts on the bubble's rendered text and the
  presence/absence of the `.caret` span across stepped cursors (AC1,
  AC2, AC3, AC4, AC5, AC7).
- `frontend/src/store/useSimulator.replay-cancel.test.ts` (or fold
  into the existing cancel test) — asserts that after `cancelRun()` +
  `selectMessage(other)`, the loaded turn's replay still walks
  AC1→AC4 cleanly (AC9).

**Frontend tests (touch)**
- `frontend/src/lib/chatStatus.test.ts` — add the new export to its
  surface check; existing assertions untouched.
- `frontend/src/components/ChatPanel.test.tsx` (if it exists) — a
  regression: live `send()` flow still uses the `pending` bubble
  exactly (AC6).

**Backend**
- None.

**Documentation**
- `MEMORY.md` — one-line pointer added once the spec is DONE & green
  (no doc file authored, the spec itself is the doc).

## Protocol changes (constitution §1)

None.

- `backend/app/schemas.py` — unchanged.
- `frontend/src/types/events.ts` — unchanged.
- Stage/Phase: no additions.
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` exhaustive maps — unchanged.
- `readoutFor` / `renderDetail` — unchanged.

## Data model changes

None. The relational store and Chroma index are untouched.

## i18n strings (constitution §4)

None — every label this needs already ships in `en` + `pt`:

| key / location | en | pt |
|---|---|---|
| `t.chat.thinking` (existing, since 012) | `"Thinking…"` | `"Pensando…"` |
| `t.chat.stage.<phase>` (existing, since 012) | already populated for every `TimelinePhase` | already populated |

A grep gate in CI (`AC13`) asserts no new keys were added.

## Cloud map (constitution §5)

n/a — no new tier or station.

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| — | — | — | — | — |

## Test strategy (constitution §9 — TDD)

Every acceptance criterion maps to at least one failing test before
its implementing code.

| AC | Test | File |
|---|---|---|
| AC1 — `cursor=-1`, no answer → status bubble | `test_replay_bubble_renders_status_when_no_answer_yet` | `frontend/src/lib/chatStatus.replay.test.ts` |
| AC2 — cursor mid-`agent.think` → `Reasoning…` | `test_thread_bubble_shows_reasoning_label_at_think_cursor` | `frontend/src/components/ChatPanel.replay.test.tsx` |
| AC3 — cursor mid-`llm.generate` → partial answer + caret | `test_thread_bubble_streams_partial_answer_with_caret` | `frontend/src/components/ChatPanel.replay.test.tsx` |
| AC4 — cursor at tail → persisted `message.answer`, no caret | `test_thread_bubble_settles_to_persisted_answer_at_tail` | `frontend/src/components/ChatPanel.replay.test.tsx` |
| AC5 — non-loaded turns never re-animate | `test_only_loaded_turn_streams_during_replay` | same |
| AC6 — live `send()` still drives `pending` bubble | `test_live_send_pending_path_is_unchanged` (regression) | same |
| AC7 — `traceExpired` falls back to persisted | `test_replay_falls_back_to_persisted_when_trace_expired` | same |
| AC8 — empty `events` is safe | `test_replay_bubble_falls_back_when_no_events` | `chatStatus.replay.test.ts` |
| AC9 — cancelled runs don't poison next replay | `test_replay_after_cancel_walks_cleanly` | `useSimulator.replay-cancel.test.ts` (or new) |
| AC10 — stepping monotonically walks status → answer → final | `test_stepped_cursor_progression_is_monotone` | `chatStatus.replay.test.ts` |
| AC11 — gates green | CI: `ruff` + `pytest` + `tsc --noEmit` + `vite build` + `vitest` |
| AC12 — no protocol drift | grep diff: `schemas.py` ↔ `events.ts` byte-equal pre/post |
| AC13 — no new strings | grep diff: `i18n/strings.ts` byte-equal pre/post |

The unit tests on `chatStatus.replay.test.ts` are the cheapest red →
green loop (pure function, no React). The RTL tests confirm the
projection actually lands in the right DOM nodes.

A canned trace fixture (the same shape as `tourTrace` or
`derive.test.ts` fixtures) gives every replay test a deterministic
event log. No real OpenAI call needed — these tests stay in the
keyless tier (they run on every CI matrix).

## Risks / trade-offs

- **The persisted text and the reassembled stream may differ
  microscopically.** Whitespace normalization, edge tokens,
  end-of-stream trimming. AC4's "settled = persisted" rule avoids
  this turning into a visible glitch: at the tail we always render
  `message.answer`. Mid-replay, any visible drift is bounded by what
  `deriveView` already produces today on `view.answer` (and it's the
  same view the Agent drill-in already shows — no new exposure).
- **Two stage states could fire in quick succession** as cursor
  crosses event boundaries: replay tick (280 ms) is faster than human
  reading speed, so labels flick by. That mirrors the live experience
  exactly (and matches what the canvas does). If user research later
  asks for a slower replay tick, a knob on `togglePlay` is a single-
  line change — not in this spec.
- **Bubble height jumps** as the body switches from `<StageStatus>`
  (~20 px) to a multi-line answer. Same jump the live bubble has
  today (012); no new visual class. The auto-scroll effect already
  re-runs on `bubbleKey` changes (`ChatPanel.tsx:317`).
- **Test isolation around `useSimulator` / `useChat`.** The 040 RTL
  setup (already in the repo) provides the `scrollTo` polyfill and
  the `useHud` mock. We reuse it. App-level tests will additionally
  need `ResizeObserver` (already documented in [[spec-041-settings-page]]).
- **`isFlowSettled` semantics shift slightly** (adds a "no events at
  all" short-circuit) — `chatStatus.test.ts` regression tests
  already pin its existing branches; we add coverage for the new one
  rather than mutate the old ones.
- **No backend changes** ⇒ no `ruff`/`pytest` risk surface. CI matrix
  passes by accident only when the FE tests do too; that's the right
  failure mode.
- **`useChat.pending` and `useSimulator.events` are independent
  stores.** A live send mutates both; a replay mutates only the
  simulator. The new branch checks `loadedTraceId` (a `useChat`
  field), so we read it via the same selector pattern the existing
  `Thread` already uses — no cross-store subscription added.
