# Spec: Cumulative conversation HUD + pre-send estimate

| | |
|---|---|
| **ID** | 018-cumulative-hud |
| **Status** | done |
| **Depends on** | 022-message-trace-link (re-derive aggregation source) |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

Token and cost accounting are real and per-turn (011), but the **first intuition about
operating an LLM — cost grows with the conversation** — is invisible. There's also no
sense, *before* sending, of how big the context already is or what the next turn will
roughly cost. A small running HUD (`3 turns · 5.7k tokens · $0.0024 · 4 tool calls ·
2 RAG hits`) plus a pre-send estimate makes the economics of a multi-turn agent
tangible — the lesson that context is finite and accumulates.

## Goals

- Show a **per-conversation cumulative HUD**: turns, total tokens, total cost, tool
  calls, RAG hits — growing turn by turn.
- Show a **pre-send estimate** of the current context size (≈ tokens, ≈ cost), clearly
  labeled as an estimate (not billed).
- Surface the **tokenizer** in play (e.g. `tiktoken · o200k_base`) so learners grasp
  that token counts are model-specific (folds in assessment §4.2).

## Non-goals

- No new `Stage`; the HUD aggregates existing per-turn usage data.
- The pre-send number is an **estimate** — it is not a billed figure and is labeled so.

## User-facing behavior

- A compact HUD near the conversation header shows the running totals; it **resets per
  conversation** and updates as each turn completes.
- The composer shows a pre-send hint (≈ current context tokens · ≈ cost/turn) with a
  tokenizer label.
- All labels bilingual (en + pt); numbers via existing `formatTokens` / `formatUsd`.

## Acceptance criteria

1. **AC1** — A pure function folds a list of per-turn usage records into **cumulative
   totals**: `turns`, `promptTokens`, `completionTokens`, `totalTokens`, `costUsd`,
   `toolCalls`, `ragHits` — each the correct sum/count.
2. **AC2** — The HUD reflects only the **active conversation** and updates when a turn
   completes; switching conversations shows that conversation's own totals.
3. **AC3** — A pre-send estimate renders an approximate context-token count (and ≈cost),
   explicitly marked as an estimate, and updates with the composed input.
4. **AC4** — Token/cost rendering reuses `formatTokens` / `formatUsd`; the tokenizer
   label is shown.
5. **AC5** — All new strings exist in **both en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a**

## Clarified (2026-05-27)

- [x] **Aggregation source** → **re-derive from saved traces.** Each persisted message's
  trace is loaded (via 022's mechanism) and its usage tallied; the HUD folds those
  per-turn records. **Hard dependency on 022.** The bounded `TraceStore` may have evicted
  an old trace → that turn is **skipped gracefully** and the HUD is marked partial (no
  crash, no faked numbers).
- [x] **Counting rules** → **tool call = each `mcp.call` END; RAG hit = each retrieved
  chunk** (= top_k). No magic relevance threshold — count what actually happened.
- [x] **Pre-send estimate** → **`js-tiktoken` (real, lazy-loaded).** Lets the HUD show an
  honest `tiktoken · o200k_base` label (the lesson that counts are model-specific);
  loaded on demand to bound bundle size. The number is explicitly an **estimate**.

## Out of scope / deferred

- Prompt-cache savings estimate ("eligible for caching · saves ~60%") — conceptual,
  deferred.
- Cross-conversation / account-wide cost rollups.
