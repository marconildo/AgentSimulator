# Spec: Revisit a turn's trace (message ↔ trace link)

| | |
|---|---|
| **ID** | 022-message-trace-link |
| **Status** | done |
| **Enables** | 018-cumulative-hud, 020-turn-diff (per-message trace source) |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

Switching conversations **wipes the canvas by design** (`openSession → reset()`), and
there is no way to revisit a past turn's journey — re-open a chat and the canvas is
"dead." Yet every persisted message already carries a `trace_id` (`chatApi.ts`), and the
backend already serves `GET /api/trace/{id}`. So **loading a past turn's trace is a
frontend-only feature on an existing foundation** — and it's also the enabler for
hover-to-highlight (assessment §4.12) and for the prior-turn data that 018/020 want.

## Goals

- Let the user **select a past message and load its trace** onto the canvas so the
  diagram/inspector/timeline reflect that turn, replayable and step-able.
- Make re-opening a conversation **not leave a dead canvas** (show the last turn's
  trace, or a clear "click a message to load its trace" affordance).
- *(secondary)* **Hovering a message highlights** the stations/hops that turn traversed.

## Non-goals

- No new `Stage`; reuses `GET /api/trace/{id}` and the existing simulator projection.
- Not auto-replaying with animation on switch (a static loaded trace is enough; the
  user can press play) — unless decided otherwise in clarify.

## User-facing behavior

- Clicking a past agent message loads that turn's trace; the canvas, inspector and
  timeline all reflect it; replay/step works over it exactly like a live run's trace.
- Re-opening a conversation surfaces the **most recent turn's trace** (or the
  click-to-load hint) rather than an empty canvas.
- Hovering a message emphasizes the path it took (secondary).
- Affordance text bilingual (en + pt).

## Acceptance criteria

1. **AC1** — Given a persisted message with a `trace_id`, selecting it **loads that
   trace** into the simulator (events + cursor set) so `deriveView` renders it; replay
   and step operate over the loaded events.
2. **AC2** — Re-opening a conversation with prior turns **does not leave the canvas
   empty**: it loads the latest turn's trace, or shows an explicit click-to-load
   affordance (decision in clarify).
3. **AC3** — Loading a past trace **does not** corrupt or resume a live run; selecting a
   message while idle is safe and a fresh `send` afterwards still works.
4. **AC4** — *(secondary)* Hovering a message emphasizes the stations its trace touched;
   un-hover clears the emphasis.
5. **AC5** — All new affordance strings exist in **both en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a** (consumes existing `TraceSummary`)
- Station it maps to in `stations.ts`: **n/a**

## Clarified (2026-05-27)

- [x] **Source** → **refetch via `GET /api/trace/{id}`, memoized client-side per
  `trace_id`.** Fresh on first select; the cache avoids refetch storms — the shared
  mechanism 018/020 reuse when re-deriving per-message usage.
- [x] **On switch** → **auto-load the latest turn's trace** so the canvas is never dead
  (Goal #2); older turns load on click. If the latest trace was evicted, fall back to
  the click-to-load hint.
- [x] **Trace retention** → a clear **"trace expired"** state on a 404 (the canvas shows
  an explainer, no crash; the message stays selectable). 018/020 skip an expired turn.
- [x] **AC4 (hover emphasis) is secondary** and naturally builds on 014's
  `emphasizedStation` plumbing → may ship **after 014**; the 022 core (AC1–AC3, AC5)
  does not depend on it.

## Out of scope / deferred

- Persisting full traces durably (beyond the bounded in-memory `TraceStore`).
- Diffing two loaded turns (that's 020-turn-diff, which may build on this).
