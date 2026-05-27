# Plan: Chat bubble stays in lockstep with the paced flow

> The HOW. Respects the constitution: client-side projection only (§7), no
> server change (§3), no protocol change (§1/§6), new prose en+pt (§4).

## Approach

The desync lives entirely on the frontend. Two pure decisions, then thin glue:

1. **What the live bubble shows** is a pure projection of the paced view — the same
   `deriveView(events, cursor)` the canvas uses. While the derived `answer` is
   empty, the bubble shows the **current timeline phase** (`activePhase`, 004) as a
   running-status label; once `answer` is non-empty it shows the answer (with the
   streaming caret). This automatically satisfies both modes: stream fills `answer`
   token-by-token as the cursor passes token events; batch fills it whole when the
   cursor reaches the answer END. No mode branching needed in the projector.

2. **When the persisted message replaces the bubble** is gated on the flow having
   **settled** — a pure predicate `isFlowSettled` over the simulator state (run
   over, no replay running, playhead drained to the tail). `useChat.send()` already
   fetches the persisted `messages`/`sessions` right after the network finishes; we
   just **wait for settle** before applying them (and clearing `pending`).

Alternative considered: render-time only (always apply `messages`, but keep showing
a live bubble in the panel until settled). Rejected — once `messages` includes the
new exchange, the panel would show both the persisted answer *and* the live bubble;
staging the apply in `send()` keeps a single source of truth for "what's on screen".

The new logic is isolated in a pure module so the ACs are plain Vitest unit tests
(mirrors how 009 tested `paceAdvance`, not the timer).

## Affected files

**Backend** — none.

**Frontend**
- `frontend/src/lib/chatStatus.ts` *(new)* — pure helpers:
  - `PendingBubble` = `{ kind: "status"; phase: TimelinePhase | null }` |
    `{ kind: "answer"; text: string; streaming: boolean }`.
  - `pendingBubble(events, cursor, view)` → `PendingBubble` (AC1/AC3/AC4).
  - `isFlowSettled({ events, cursor, status, playing })` → `boolean` (AC5).
- `frontend/src/i18n/strings.ts` — extend the `chat` shape with
  `stage: Record<TimelinePhase, string>` (gerund running labels); add en + pt
  values. `chat.thinking` (exists) stays the null-phase fallback.
- `frontend/src/store/useChat.ts` — in `send()`, after fetching the persisted
  `messages`/`sessions`, `await waitForFlowSettled(signal)` before
  `set({ messages, sessions, pending: null })`. Add a module-level
  `waitForFlowSettled` that resolves via `useSimulator.subscribe` + `isFlowSettled`
  (and on abort). Batch path (`playBatch`) gets the same gate.
- `frontend/src/App.tsx` — compute `bubble = useMemo(() => pendingBubble(events,
  cursor, view), …)` and pass it to `ChatPanel` (replacing `liveAnswer`).
- `frontend/src/components/ChatPanel.tsx` — `Thread` takes `bubble`; the pending
  exchange renders a `StageStatus` (spinner + resolved label, or `TypingDots` when
  phase is null) for `kind: "status"`, and the answer + caret for `kind: "answer"`.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed; `events.ts` mirror
untouched; `STAGE_TO_STATION` / `STAGE_TO_PHASE` untouched.

## Data model changes

None. Neither the Chroma vector store nor the SQLite `ConversationStore` changes.

## i18n strings (constitution §4)

New `chat.stage` running labels (one per `TimelinePhase`):

| key | en | pt |
|---|---|---|
| `chat.stage.request` | Sending… | Enviando… |
| `chat.stage.memory` | Recalling memory… | Lendo memória… |
| `chat.stage.route` | Routing… | Roteando… |
| `chat.stage.retrieve` | Retrieving… | Recuperando… |
| `chat.stage.reason` | Reasoning… | Raciocinando… |
| `chat.stage.tools` | Calling tools… | Chamando ferramentas… |
| `chat.stage.generate` | Generating… | Gerando… |
| `chat.stage.respond` | Responding… | Respondendo… |
| `chat.stage.persist` | Saving… | Salvando… |

Fallback (phase `null`): existing `chat.thinking` = "Thinking…" / "Pensando…".

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `pendingBubble` → status w/ phase when answer empty, answer when not | `frontend/src/lib/chatStatus.test.ts` |
| AC2 | `chat.stage` key parity en↔pt, all non-blank | `frontend/src/lib/chatStatus.test.ts` |
| AC3 | replay a stream log: status at pre-LLM cursors, answer once tokens reached | `frontend/src/lib/chatStatus.test.ts` |
| AC4 | batch-shaped log: status before the answer END, whole answer at/after | `frontend/src/lib/chatStatus.test.ts` |
| AC5 | `isFlowSettled` truth table (empty/streaming/playing/cursor<tail/settled) | `frontend/src/lib/chatStatus.test.ts` |
| AC6 | `send()` holds `pending` until the simulator settles, then swaps | `frontend/src/store/useChat.test.ts` |

## Risks / trade-offs

- **Subscription lifetime:** `waitForFlowSettled` must unsubscribe on resolve and on
  abort so a cancelled run can't leak a listener; resolve immediately if already
  settled. Tested via AC6 by driving simulator state directly (no real timers).
- **Manual-scrub-park edge** (spec deferred): gating on `cursor >= tail` means a
  user who parks mid-run before the playhead drains delays the persisted swap until
  they reach the end. Chosen over a `!following` escape, which would false-positive
  on batch (batch replays with `following === false`).
- **Determinism:** all assertions are over pure functions or directly-set store
  state — no flaky timer waits.
