# Spec: Agent Harness framing + Learn topic

| | |
|---|---|
| **ID** | 053-agent-harness |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-04 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The diagram teaches a clean n-tier deployment story (Client → API → **Compute
(private)** → Data → Observability), where the `agent` block is labelled
**"Agent Tier"**. That label answers *where the agent runs*, but it never names
*what the agent runtime actually is*. The runtime inside that tier — the ReAct
loop, tool execution, layered system-prompt assembly, the context window, working
and long-term memory — is the thing the industry now calls an **"agent harness"**:
the scaffolding that wraps a plain LLM and turns it into an agent. It's a current,
load-bearing term (Claude Code itself talks about its "harness"), and the app
already *shows* every piece of one without ever giving the learner the word for it.

The gap: a learner sees "Agent Tier" and "LangGraph runtime · ReAct" but leaves
without the vocabulary that ties those pieces into one named concept. We want to
name the harness at the **runtime** level (the agent station / its drill-in),
**not** rename the deployment tier — harness is a software-architecture concept,
not a deployment unit, and conflating the two would break the n-tier parallelism.

## Goals

- Name and explain the **"Agent Harness"** concept exactly where the runtime lives:
  the agent station drill-in (`AgentDetail`) and a hover glossary term.
- Give the learner a full, study-grade Learn topic on what an agent harness is, how
  it works, what its parts are (loop · tools · prompt layers · context · memory),
  and the alternatives — grounded in the stations this very app already renders.
- Keep the term bilingual-explained following the existing precedent for jargon
  proper nouns (the *term* stays "Agent Harness"; the *explanation* ships en + pt).

## Non-goals

- **Do not rename the deployment tier.** "Agent Tier" / "Camada do Agente" and its
  `alias` "Compute (private)" stay exactly as they are.
- No new runtime behavior, no backend change, no new `Stage`/`Phase`/`TraceEvent`.
- Not building DeepAgents/Multi-agent runtimes — the harness framing is orthogonal
  to the scenario relabel axis and must not disturb it.

## User-facing behavior

- Opening the Agent drill-in presents the runtime framed as an **Agent Harness**:
  a short bilingual line naming the concept ("the scaffolding around the LLM —
  loop, tools, prompt, context, memory") sits with the existing ReAct view.
- Hovering the **"Agent Harness"** term anywhere it appears shows a glossary
  tooltip with the bilingual one-line definition (same canned-glossary pattern as
  `ReAct`, `DeepAgents`, `MCP`).
- The Learn page gains an **"Agent Harness"** topic in the Gen-AI & Agents section,
  with the project's full topic structure (what / why / how / other options /
  links), in both languages.

## Acceptance criteria

1. **AC1** — The Agent drill-in (`AgentDetail`) renders a harness-framing label/line
   that contains the term "Agent Harness" and is resolvable in both `en` and `pt`
   (the term stays "Agent Harness"; surrounding prose differs per language).
2. **AC2** — A glossary entry keyed `"Agent Harness"` exists in **both** the `en`
   and `pt` glossary maps, each a non-empty one-line definition; it surfaces as a
   hover tooltip wherever the term is rendered (same mechanism as existing terms).
3. **AC3** — `allTopicsFor(lang)` includes a topic with id `agent-harness` whose
   `what`, `why`, `how`, and `options` are all non-empty for `lang ∈ {en, pt}`,
   and it carries at least one curated external `links` entry.
4. **AC4** — The deployment tier is unchanged: the `agent` tier's `title` still
   resolves to "Agent Tier" (en) / "Camada do Agente" (pt) and its `alias` to
   "Compute (private)" / "Compute (privado)".
5. **AC5** — No protocol drift: the set of `Stage` values, `STAGE_TO_STATION`, and
   `STAGE_TO_PHASE` are byte-for-byte unchanged; `backend/` has zero diff.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: existing `agent` station (framing/label only,
  no `stages` change)

## Open questions (clarify before planning)

- [x] Rename the tier or frame the runtime? → **Frame the runtime** (agent station +
  drill-in); tier label stays. *(answered by user, 2026-06-04)*
- [x] Learn depth? → **Full topic** (what/why/how/options/links), not a stub.
  *(answered by user, 2026-06-04)*
- [x] Translate "harness" to pt? → **No** — keep the term "Agent Harness" (jargon
  proper noun, same as DeepAgents/Multi-agent); explanation is bilingual.

## Addendum (2026-06-04, post-implementation feedback)

The drill-in badge alone wasn't visible enough — the user pointed at the canvas
Agent block expecting to *see* the term without opening "Open full view". Resolved
by **also naming it on the agent station card's subtitle** (`stations.ts`:
"Agent Harness · LangGraph runtime" / "Agent Harness · runtime LangGraph") — still
the *station*, still not the deployment tier (AC4 holds). New test pins the subtitle
in both langs. Also fixed a bad CSS var (`--color-border` → `--color-line`) on the
drill-in badge border.

## Out of scope / deferred

- Renaming the `agent` deployment tier (explicitly rejected — taxonomy clash).
- Any DeepAgents / Multi-agent runtime work (separate future specs).
