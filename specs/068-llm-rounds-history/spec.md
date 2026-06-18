# Spec: LLM rounds history (per-call drill-in)

| | |
|---|---|
| **ID** | 068-llm-rounds-history |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

A single chat turn makes **several LLM calls** — every reasoning round of the ReAct
loop is a real model call, plus the final answer generation. The LLM station already
shows the aggregate (`LLM rounds: 6`, total tokens, cost), but when the learner opens
the LLM detail in the Inspector they only ever see the **last** call: the inspector
reads each stage with `pick()`, which returns the most-recent matching event, so the
prompt/latency/tokens of rounds 1…N−1 are invisible.

That hides the most instructive part of the agentic loop: *how the prompt grows each
round as tool results are appended, and how latency and token cost differ between a
"decide to call a tool" round and the final "write the answer" round.* The data is
already in the trace (one `llm.prompt`/`agent.think` END per round, one `llm.generate`
END for the answer) — it just isn't projected.

## Goals

- Let the learner see **every** LLM call of the turn, not just the last one.
- For each call show: an ordinal/label, the **full assembled prompt** of that round,
  its **latency**, and its **token usage + cost**.
- Reuse the established "open full view" drill-in pattern (like the Agent node), so the
  interaction is familiar and the panel has room for long prompts.
- Stay a **pure projection** of existing trace events — no new request, no protocol
  change, live-streaming and step/replay identical.

## Non-goals

- No backend change, no new `Stage`/`Phase`/`TraceEvent`, no new metrics.
- Not changing the existing aggregated LLM readout (rounds/tokens/cost) on the node or
  the Inspector summary — those stay.
- Not redesigning the Inspector LLM detail beyond what's needed; the rich history lives
  in the full-view overlay (chosen over an inline Inspector section).
- Not visualizing the inter-round backoff timeline of the `llm_timeout` failure mode
  beyond listing each attempt as a round (graceful, no token rows).

## User-facing behavior

- The **LLM station node** gains an **"open full view"** button (same control the Agent,
  Vector DB and RAGLESS nodes already have), available collapsed or expanded.
- Clicking it opens a focused **LLM drill-in overlay** (sibling of `AgentDetail`),
  titled e.g. "LLM · calls this turn", with a **← back / ✕ close** affordance and a
  **chronological list of every LLM call** of the loaded turn:
  - **Reasoning rounds** (each `think` round): round number, latency, prompt tokens /
    completion tokens / total / cost, the decision (called tools vs answered) with the
    tool names, and the **full assembled prompt** for that round (system, conversation
    history, retrieved context, tool definitions, the message thread) — expandable.
  - The final **generation call**: latency, time-to-first-token, throughput, tokens /
    cost, and the generated answer text.
- The overlay is driven by the **same cursor** as the canvas, so stepping/replaying
  updates the list (calls appear as the cursor crosses them).
- All new chrome ships in **English and Portuguese**.

## Acceptance criteria

1. **AC1** — Given a trace with N reasoning rounds (N `agent.think` END events) plus one
   `llm.generate` END, when the rounds are derived from the event log, then the helper
   returns **N + 1** call entries in chronological order, the first N flagged as
   reasoning rounds and the last as the generation call.
2. **AC2** — Each reasoning-round entry carries the **full prompt preview** of *that*
   round (the `system`/`history`/`context`/`tools`/`messages` from its own `llm.prompt`
   END), and its own **latency** (`latency_ms`) and **token usage + cost**
   (`prompt_tokens`/`completion_tokens`/`total_tokens`/`cost_usd` from its paired
   `agent.think` END) — i.e. round 1 and round 2 expose *different* prompt text and
   *different* latency/token values, not the last round's.
3. **AC3** — The generation entry carries the answer text, latency, and (when present)
   `ttft_ms` + `tokens_per_sec` from the `llm.generate` END.
4. **AC4** — Deriving rounds from an **empty / cursor-before-first** event log returns an
   empty list (no throw); a partial log (cursor mid-loop) returns only the calls whose
   END has been reached.
5. **AC5** — The LLM node renders an "open full view" button; activating it sets the
   focused-detail target to the LLM station, and the LLM drill-in overlay mounts; closing
   it returns to the canvas/Inspector (mirrors the Agent drill-in open/close contract).
6. **AC6** — Every user-facing string introduced by the overlay exists in both `en` and
   `pt` (constitution §4).
7. **AC7** — Each reasoning round shows not only its *input* (system / user message /
   tools available) but the model's **output for that round**: an "LLM response" section
   rendering the tool call(s) it emitted (name + arguments, verbatim) or — when it
   decided to answer — a note pointing at the generation call.

## Protocol / stage impact

- New/changed `Stage`(s): **none** (pure frontend projection over existing
  `llm.prompt` / `agent.think` / `llm.generate` events).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: existing `llm` station (no new station; the node
  just joins `agent`/`rag`/`pageindex` in having a full-view drill-in).

## Open questions (clarify before planning)

- [x] Overlay vs inline Inspector section? → **Overlay** (full view, like the Agent),
      confirmed with the user.

## Out of scope / deferred

- A latency/token sparkline across rounds (could be a later enrichment).
- Diffing consecutive rounds' prompts (the Agent's 020 turn-diff is a precedent, but
  here it would be round-to-round; deferred).
