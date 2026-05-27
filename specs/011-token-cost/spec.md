# Spec: Real token + cost accounting on the LLM block

| | |
|---|---|
| **ID** | 011-token-cost |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Make the cost of agentic reasoning visible and **real**: capture OpenAI's actual
> token usage from every model call (each reasoning round's decide call + the final
> answer generation), aggregate it per run, price it in US$, and surface **rounds
> through the LLM, prompt/completion/total tokens, and cost** on the LLM block.

## Problem / motivation

The Simple scenario shows *that* the LLM runs, never *what it costs*. Today there
is **no real token accounting**: the LLM "N tokens" readout counts streamed text
chunks (not tokens), the `decide` calls capture no usage at all, and the
AgentDetail context-window bar is a `len/4` character estimate. There is **no USD
cost anywhere**, and the number of times the agent actually hit the model (rounds)
isn't shown.

Understanding an agent *in practice* means seeing its economics: every reasoning
round is a real model call with a real token bill, and a multi-round tool loop
costs more than a one-shot answer. This is also the assessment's "honest cost"
ask, pulled forward from the Intermediate rung into Simple because tokens and cost
are **real, cheap to capture, and core to the lesson** (constitution §3 —
everything real). *(This reverses the roadmap note that deferred token/cost to the
Intermediate rung; decided with the user 2026-05-26.)*

## Goals

- **Capture real usage** from each OpenAI call the agent makes: the per-round
  `decide` call (tool/answer decision) **and** the final answer generation —
  prompt, completion and total tokens, straight from the provider's usage metadata.
- **Price it** via a small, explicit **per-model US$ table** (input/output per 1M
  tokens); unknown models price at `0` rather than guessing.
- **Aggregate per run** in the pure projection: **rounds** (= number of LLM calls),
  summed prompt/completion/total tokens, and summed cost — accumulating as the run
  progresses so the LLM block updates live.
- **Surface on the LLM block**: the node readout shows total tokens + cost, the
  expanded node shows rounds/tokens/cost, and the inspector breaks it down
  (rounds, prompt, completion, total, US$).
- All new labels **bilingual** (en + pt) — §4. Numbers/currency are formatted, not
  translated prose.

## Non-goals

- **No new `Stage`/`Phase`.** Usage rides on the existing events' `metrics`
  (`TraceEvent.metrics` already exists); the `Stage` enum is unchanged (§1).
- **No live per-token billing or streaming usage deltas** — usage lands on each
  call's END event (decide end, generate end), which is when OpenAI reports it.
- **No budget caps / FinOps controls / gateway** — that's the Advanced rung
  (`gateway`, `observability`), not this spec.
- **No AgentDetail anatomy redesign** — `010-llm-as-brain` owns that; it will
  *consume* the aggregate this spec exposes.
- **No persistence** of cost across runs / no historical cost dashboard.

## User-facing behavior

Run a message. As the agent reasons, the **LLM** station now reports real numbers:
while streaming it still shows the live token count; once a round completes it
shows **total tokens and the US$ cost so far**, climbing with each round. Expanding
the LLM node shows **rounds · tokens · cost**; selecting it opens an inspector
section breaking out **rounds, prompt tokens, completion tokens, total tokens and
cost in US$**. A tool-loop question (several rounds) visibly costs more than a
one-shot answer. *(All new labels ship en + pt — §4.)*

## Acceptance criteria

> Numbered, testable. Pricing/aggregation ACs are deterministic unit tests (no
> key). The end-to-end usage AC runs against **OpenAI** and asserts structurally.

1. **AC1 — deterministic pricing.** A pure `cost_usd(model, prompt, completion)`
   returns the price-table dot product: for `gpt-4o-mini` (input \$0.15/1M, output
   \$0.60/1M), `cost_usd("gpt-4o-mini", 1_000_000, 0) == 0.15` and
   `cost_usd("gpt-4o-mini", 0, 1_000_000) == 0.60`; an **unknown model returns 0.0**.
2. **AC2 — usage on every LLM call (real).** `[openai]` — running a tool-using
   question yields at least one `agent.think/end` (a decide call) **and** the
   `llm.generate/end`, each carrying `prompt_tokens > 0`, `total_tokens > 0`, and a
   `cost_usd >= 0` in its `metrics`.
3. **AC3 — projection aggregates rounds + totals.** Pure frontend: `deriveView`
   exposes `usage` with `rounds` = the count of LLM calls (`agent.think/end` +
   `llm.generate/end`), and `promptTokens`/`completionTokens`/`totalTokens`/`costUsd`
   summed across those events — accumulating with the cursor (partial mid-run).
4. **AC4 — LLM block shows it.** The LLM node's expanded rows and the inspector
   render rounds, total tokens and US$ cost from `view.usage`; a `tsc`-clean,
   exhaustive `readoutFor`/`renderDetail` still covers every `StationId`.
5. **AC5 — backward-compatible protocol.** The `Stage` enum and `events.ts` mirror
   are unchanged (usage is additive `metrics` only); existing agent/derive tests
   still pass (a run with no usage metadata aggregates to zeros, never errors).
6. **AC6 — bilingual.** Every new label (rounds, prompt, completion, total, cost)
   exists in en **and** pt (§4).

## Protocol / stage impact

§1 & §6.

- New/changed **executing** `Stage`(s): **none.** Usage is additive on existing
  events' `metrics`: `prompt_tokens`, `completion_tokens`, `total_tokens`,
  `cost_usd` (floats) on `agent.think/end` (decide) and `llm.generate/end`.
- Mirror in `frontend/src/types/events.ts`: **n/a** — `metrics: Record<string,
  number>` already covers new keys; no enum/type change.
- Station mapping: **unchanged.** The LLM node *aggregates* usage from the decide
  (agent.think) and generate events via the projection — `010-llm-as-brain` makes
  the "think = an LLM call" relationship visual.

## Clarifications (resolved 2026-05-26)

- [x] **Q — Simple or Intermediate?** → **Simple, now.** Tokens + cost are real and
  cheap to capture; hiding them behind a locked rung weakens the core lesson.
  Reverses the earlier roadmap deferral (memory updated).
- [x] **Q — where does decide-call usage show?** → aggregated onto the **LLM block**
  (it *is* an LLM call), via the projection summing `agent.think/end` usage with
  `llm.generate/end` usage. Rounds = total LLM calls.
- [x] **Q — pricing source?** → a small **explicit per-model table** in the backend
  (public list prices, a teaching approximation), unknown model ⇒ 0. Not fetched.

## Out of scope / deferred

- Per-token live cost ticking during the stream.
- Cost across the conversation / a historical FinOps view.
- Embedding-call cost (RAG) — could be added to the table later; this spec targets
  the chat/agent LLM calls.
