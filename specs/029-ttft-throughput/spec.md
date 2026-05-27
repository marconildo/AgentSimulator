# Spec: Time-to-first-token & generation throughput

| | |
|---|---|
| **ID** | 029-ttft-throughput |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

Generation is the longest stage of a typical run, and today the app shows only its
**duration**. That hides the most instructive part of the story: a streamed answer has
two very different clocks — **time to first token (TTFT)**, the latency the user
actually *feels* before text starts appearing, and **throughput** (tokens/second), the
rate it then types out. A 14-second generate is not "14 seconds of waiting": it might be
~1s to first token and then a steady stream. Collapsing both into one number teaches the
wrong intuition about why streaming exists.

The token/cost work (011) already captures **real** `prompt_tokens` / `completion_tokens`
per call, but the top-of-chat counter shows only an aggregate total — so the learner
never sees that **input and output tokens are priced and sized differently** (and that
tool round-trips inflate input tokens). Surfacing TTFT, throughput and the input/output
split makes the latency-and-cost story honest and concrete.

## Goals

- Measure, for the streaming generation call, **time to first token** and **generation
  throughput** (tokens/second), as real metrics on the existing `llm.generate` stage —
  no fakery (constitution §3).
- Surface TTFT and throughput in the **LLM station readout / Inspector**, next to the
  existing duration and token/cost figures.
- Split the cumulative token counter into **input vs output** (prompt vs completion)
  tokens — the data already exists from 011; this exposes it.
- All new labels ship in **English and Portuguese** (constitution §4).
- Fully backward compatible: a run with no streamed tokens (or an older trace without
  the new metrics) simply omits TTFT/throughput — nothing breaks.

## Non-goals

- **No new `Stage`/`Phase`/`TraceEvent` type.** TTFT and throughput are additive numeric
  keys on the existing `metrics` map of the `llm.generate` END event; the input/output
  split reuses the `prompt_tokens`/`completion_tokens` already emitted by 011.
- Not per-token inter-arrival histograms, not a streaming sparkline animation — just the
  two summary metrics plus the token split.
- Not re-pricing or changing the cost model (011's price table stays as-is).
- Not measuring TTFT for the non-streaming `agent.think` reasoning calls (those are
  one-shot decisions, not streamed); TTFT is a property of the streamed generation.
- Not a per-tool token breakdown (a fair idea, but its own scope — see deferred).

## User-facing behavior

**LLM Inspector / readout.** When a run has generated an answer, the LLM station shows,
alongside duration and tokens/cost:

- **Time to first token** — e.g. `TTFT 0.9s` — the wait before text began streaming.
- **Throughput** — e.g. `~42 tok/s` — the generation rate.

**Cumulative HUD (top of chat).** The token figure decomposes into input/output, e.g.
`3.6k tokens (2.9k in · 0.7k out) · $0.0022` — the split visible at a glance, the total
preserved.

Both TTFT/throughput and the input/output labels ship in **en + pt**. When the metrics
are absent (no streamed run yet, or a replayed legacy trace), those rows simply don't
render — no zeros, no placeholders.

## Acceptance criteria

> Backend tests needing the model are marked `[openai]` and assert **structurally**
> (presence + ordering bounds), tolerating variability (constitution §9).

1. **AC1 — TTFT and throughput are emitted (real)** `[openai]`. After a streamed run,
   the `llm.generate` END event's `metrics` contains `ttft_ms > 0` and
   `tokens_per_sec > 0` whenever ≥1 token was produced.
2. **AC2 — TTFT is within the generation window** `[openai]`. `ttft_ms` is ≤ the stage's
   total `latency_ms` (first token cannot arrive after the stage ends), and
   `tokens_per_sec` is consistent with `tokens` and the post-first-token duration within
   a tolerance.
3. **AC3 — Batch mode still measures TTFT.** A `mode="batch"` run (no PROGRESS token
   events) still records `ttft_ms`/`tokens_per_sec` on the generate END event (the
   provider still yields tokens; only UI streaming differs).
4. **AC4 — LLM readout surfaces TTFT + throughput.** Given a view whose `llm.generate`
   carries the metrics, the projection exposes them and the LLM station readout shows a
   TTFT value and a tokens/second value; given a view without them, neither row renders.
5. **AC5 — HUD shows the input/output split summing to the total.** The cumulative HUD
   renders input (prompt) and output (completion) token figures whose sum equals the
   displayed total tokens; with no usage yet, the split is absent.
6. **AC6 — Bilingual labels (§4).** The TTFT, throughput, input-tokens and output-tokens
   labels have identical leaf keys in `en` and `pt`, each a non-empty string.
7. **AC7 — No protocol/visual-model drift.** No `Stage`/`Phase`/`TraceEvent` *type*
   added; `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity unchanged; existing `test_agent`
   / token-cost tests still pass; legacy traces without the metrics replay cleanly.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Additive numeric keys on `metrics`:
  `ttft_ms`, `tokens_per_sec` on the `llm.generate` END event.
- Mirror in `frontend/src/types/events.ts`: the `metrics` field is already an open
  numeric map; **no type change required** (the new keys are documented, not typed
  individually). The input/output split reuses 011's existing `prompt_tokens` /
  `completion_tokens`.
- Station it maps to in `stations.ts`: **none new** — surfaces on the existing **LLM**
  station readout and the cumulative HUD.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Where to measure TTFT?** → In the **generate node's stream loop**: monotonic
  clock at stage start, captured again on the first yielded token (`ttft_ms`), and the
  rate computed from the token count over the post-first-token interval
  (`tokens_per_sec`). Real, no estimation.
- [x] **TTFT for reasoning (`agent.think`) too?** → **No.** Those calls are one-shot
  decisions, not streamed; TTFT is a generation property.
- [x] **New metric type in the protocol?** → **No.** `metrics` is `dict[str, float]`;
  adding keys is additive (like 011 did with `prompt_tokens`), so no `events.ts` type
  change — documented as new keys, parity tests unaffected.
- [x] **Show zeros when absent?** → **No.** Omit the rows entirely when the metrics
  aren't present (legacy/replayed traces, or a run with no tokens).

## Out of scope / deferred

- Per-tool token accounting (the round-trip cost of each MCP call) — valuable, but a
  separate scope touching how tool calls record usage.
- Inter-token latency distribution / streaming sparkline.
- Surfacing TTFT on the latency waterfall (015) as its own segment — could be a small
  follow-up once the metric exists.
