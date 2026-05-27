# Spec: The LLM is the brain — show it being used to think

| | |
|---|---|
| **ID** | 010-llm-as-brain |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> The single most important agent concept — *the agent calls the LLM, in a loop,
> to reason* — is under-told. Make it unmistakable: (A) in the flow, the agent
> visibly **uses the LLM to think** on every reasoning round (not just to generate
> the final answer), and (B) the Agent drill-in reads as the **anatomy of an
> agent** — brain (LLM), senses (inputs), memory, hands (tools), speech (answer) —
> with the **real** token/cost numbers from `011-token-cost`.

## Problem / motivation

The LLM is the agent's brain, but the visualizer hides that:

1. **In the flow**, the model call that *decides* (reason → tool-or-answer) is
   recorded only as `agent.think` on the **Agent** station; the LLM station's only
   visible duration is the final answer generation. So the canvas reads as "the
   agent thinks by itself, then talks to the LLM once at the end" — the opposite of
   the truth (every round is a model call). The reasoning round-trip to the brain
   is a zero-duration marker, so it never animates.
2. **In the Agent drill-in** (the "anatomy" view), the panels are a flat list of
   labels. The brain isn't the center, "reason = an LLM call" is never stated, and
   the context-window tokens are a `len/4` **estimate** — now that real tokens and
   cost exist (011), the anatomy should show them.

This is the user's explicit ask ("o flow tem que mostrar o agente usando a LLM
para pensar, pq ela é o cérebro" + "revise todo o canvas do agente, quero passar a
anatomia do agente"). It's the core lesson of the Simple scenario.

## Goals

- **Flow shows reasoning as an LLM call.** Each reasoning round visibly lights the
  **LLM** station and animates the **Agent → LLM** round-trip *while the model is
  deciding* — so the brain is used on every round, then once more to generate.
- **Agent drill-in = anatomy.** Restructure the Agent full view to read as an
  organism: **brain (LLM)** at the center, **senses/inputs** (the user message),
  **memory** (working + long-term + vector recall), **hands** (tools + results),
  **speech** (the answer), and the **reasoning loop** (each round = one model call
  with its decision).
- **Real numbers in the anatomy.** Show rounds, real prompt/completion/total tokens
  and US$ cost (from `011`'s `view.usage`) — the context-window breakdown stays a
  clearly-labelled *approximate proportion*, but the headline totals are **real**.
- All new prose **bilingual** (en + pt) — §4.

## Non-goals

- **No change to the agent's behavior or the model calls themselves** — the agent
  already calls the model to decide each round (`provider.decide`); this spec makes
  that call *observable*, it doesn't add or remove calls.
- **No token/cost capture work** — that's `011` (a dependency); this spec only
  *renders* what `011` exposes.
- **No new station** — the brain is the existing `llm` station; the agent the
  existing `agent` station. (No `aiops`/preview-node work.)
- **No live pacing work** — `009` already paces the journey; this spec just makes
  the reasoning round-trip a real (non-zero) span so pacing has something to show.

## User-facing behavior

Send a message. On each reasoning round the **Agent** lights, then the **LLM**
lights as the agent consults the model to decide (the Agent → LLM hop animates),
then control returns to the Agent; if it called a tool, the **MCP** lights, then it
reasons again — and finally the LLM lights once more to generate the answer. The
LLM block (per `011`) totals the rounds, tokens and cost across all of these calls.

Open the Agent's **full view**: it now reads as an **anatomy** — the brain (the
model) at the center, fed by the senses (the message), working and long-term
memory, and the tools it can use; the reasoning loop shows each round and its
decision; and it reports **real** rounds, tokens and US$ cost, plus the assembled
context window. *(All new prose ships en + pt — §4.)*

## Acceptance criteria

> Numbered, testable. The flow-observability AC is a backend assertion (structural,
> `[openai]`); the anatomy is verified by the type-checked build + the projection
> numbers it consumes (already unit-tested in 011) + i18n parity.

1. **AC1 — reasoning is an observable LLM span.** The reasoning model call is
   emitted as an `llm.prompt` event with **both** a `start` and an `end` phase
   (today it is an `end`-only marker), so the LLM station is *active during the
   decide*, not for a zero-duration instant. `[openai]`: a run yields `llm.prompt`
   with `phase ∈ {start, end}` and the `start` precedes the round's `mcp.call`s.
2. **AC2 — reasoning round-trip animates Agent ⇄ LLM.** Pure projection: given a
   round's events (`agent.think/start` → `llm.prompt/start` → `llm.prompt/end` →
   `agent.think/end`), `deriveView` lights the **llm** station active during the
   prompt span and produces the `agent→llm` (then `llm→agent`) active hop — a
   regression test over the projection.
3. **AC3 — assembled prompt still inspectable.** The `llm.prompt/end` still carries
   the full prompt preview (`system`, `context`, `tools`, `history`) so the
   inspector’s assembled-prompt section is unchanged (back-compat with 006/007).
4. **AC4 — anatomy renders real numbers.** The Agent drill-in shows rounds, real
   total tokens and US$ cost from `view.usage`; the context-window bar is labelled
   as an approximate proportion; the build (`tsc --noEmit`) is clean and the
   existing `agent` tests still pass.
5. **AC5 — protocol intact.** No new `Stage`/`Phase` is added (AC1 reuses the
   existing `llm.prompt` with a `start`); `schemas.py` ↔ `events.ts` stay in sync;
   every `Stage` stays mapped to a station and a phase (§1, §6).
6. **AC6 — bilingual.** Every new anatomy label exists in en **and** pt (§4).

## Protocol / stage impact

§1 & §6.

- New/changed `Stage`(s): **none.** `agent.think` now **wraps** the model call in
  the existing `llm.prompt` stage (emitted as a `start`/`end` span around
  `provider.decide`) instead of a trailing `end`-only marker. The `Stage` enum is
  unchanged, so `events.ts` needs **no** change.
- Station mapping: unchanged — `llm.prompt` already maps to the `llm` station and a
  `TimelinePhase`; it simply gains a `start` phase.
- Emitted in: `backend/app/agent/graph.py` `think_node` (restructured).
- `readoutFor`/`renderDetail`/`STAGE_TO_PHASE`: no new cases (same stages); the
  `AgentDetail` component is redesigned (content, not the station model).

## Clarifications (resolved 2026-05-26)

- [x] **Q — new `llm.reason` stage vs. reuse `llm.prompt`?** → **reuse
  `llm.prompt`** as a `start`/`end` span around the decide call. It already maps to
  the LLM station/phase and already carries the prompt preview; spanning it makes
  the reasoning call observable with **zero protocol churn** (no enum/mirror/maps
  change). A new stage would be more churn for no extra clarity.
- [x] **Q — keep decide-usage on `agent.think` (011)?** → **yes, unchanged.** 011's
  aggregation (decide rounds on `agent.think` + the generation on `llm.generate`)
  stays; this spec is about *visibility*, and moving usage would needlessly churn a
  done spec.
- [x] **Q — real vs estimated tokens in the anatomy?** → **real totals headline**
  (rounds/tokens/cost from `view.usage`); the per-part context bar stays an
  explicitly-labelled approximation (real per-part token splits aren't available).

## Out of scope / deferred

- A distinct visual for "reasoning" vs "generating" on the LLM node beyond the
  existing readouts.
- Animating the *internal* ReAct transitions inside the Agent node itself (the
  drill-in already narrates them).
