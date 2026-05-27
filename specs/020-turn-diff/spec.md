# Spec: Diff the context window between turns

| | |
|---|---|
| **ID** | 020-turn-diff |
| **Status** | done |
| **Depends on** | 022-message-trace-link (prior-turn trace source) |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

"The context window is finite and **grows with the conversation**" is the lesson, and
it's best taught by **comparison**. The Agent anatomy already shows one turn's context
window (system / history / RAG / tools / user). A side-by-side "compare with previous
turn" — highlighting what grew (`history +432 tokens`, `system = same`) — sells the
concept better than any paragraph.

## Goals

- Offer a **"compare with previous turn"** view that diffs two turns' context-window
  section breakdowns and highlights the deltas.

## Non-goals

- No new `Stage`; this diffs two **existing** traces client-side.
- Not a full text diff of the prompts — a per-section token/size delta is the target.

## User-facing behavior

- From the Agent anatomy, the user can compare the current turn with the previous one;
  the two context windows are shown with each section's delta (grew / shrank / same).
- Labels bilingual (en + pt).

## Acceptance criteria

1. **AC1** — A pure function diffs two turns' section breakdowns
   (`system`, `history`, `rag`, `tools`, `user`) and returns a **signed delta per
   section** plus the total delta.
2. **AC2** — Sections that are identical are reported as **unchanged** (delta 0); a
   section present in one turn only is reported as a full add/remove.
3. **AC3** — With **no previous turn** available, the compare affordance is unavailable
   and explains why (needs a prior turn).
4. **AC4** — All new strings exist in **both en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a**

## Clarified (2026-05-27)

- [x] **Previous-turn source** → **stored trace via 022.** The prior turn is loaded from
  its persisted message's trace (022's mechanism), consistent with 018 and surviving
  reload. **Hard dependency on 022** (evicted prior trace → compare unavailable, AC3).
- [x] **Section token source** → **reuse the existing estimated per-section split** (the
  same `tok()` heuristic the context-window bar already shows). One source, so the diff
  matches what's on screen; extracted into a shared pure `contextSections(events)`.
- [x] **Scope** → **adjacent only (n vs n-1).** Compare the current turn with the
  immediately previous one. Pick-any-two deferred.

## Out of scope / deferred

- Diffing the literal prompt text token-by-token.
- Diffing tool sets / RAG chunks identity (only sizes here).
