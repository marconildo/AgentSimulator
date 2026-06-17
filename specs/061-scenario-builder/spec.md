# Spec: Scenario builder (compose-your-own architecture)

| | |
|---|---|
| **ID** | 061-scenario-builder |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

> Replace the two rigid radio axes — the maturity **ladder** (008, pick one closed
> rung) and the **track** filter (059, view one theme at a time) — with an **à-la-carte
> component builder**: the user toggles individual components on/off to compose the
> architecture they want, the canvas renders exactly that set, and the maturity level
> (simple / intermediate / advanced) becomes a **derived badge** of the selection rather
> than a thing you pick. So "Simple RAG **+** Hybrid Search", or "ReAct **+** just a
> Gateway", become expressible — instead of forcing the user into a prepackaged rung.

## Problem / motivation

The current model has two mutually-exclusive radio controls and neither lets the user
*compose*:

- **The ladder (008)** is a single global `simple | intermediate | advanced`. Each rung
  is a **closed bundle** — you cannot have "Simple but with the reranker", or pull in a
  single Advanced piece (a Gateway) without dragging the whole AI-Ops cluster along.
- **Tracks (059)** are a **view filter only** ("never changes execution"), and
  mutually-exclusive: you see *one* theme at a time. As the user put it — *"não posso
  misturar trilhas, acaba sendo uma ou outra."* That is by-design (tracks exist to hide
  clutter on the Advanced rung), but it means the second axis can't compose either.

Real architectures are assembled **piece by piece**: you start from a minimal agent and
add a reranker, or hybrid search, or a gateway — each a deliberate decision with a cost.
The visualizer should teach that. The honest model is a **builder**: a palette of
components the user switches on/off, where the app *classifies* the resulting maturity
("adding Hybrid Search moved you to Intermediate") instead of dictating it.

Two product decisions were taken up front (see Open questions → resolved):

- **Two-zone palette** — the palette shows **all** components but visibly separates
  those that **execute for real** (base pipeline, reranker, RAGLESS, ReAct/DeepAgents)
  from **preview** ones (`comingSoon`: Gateway, Guardrails, Cache, Eval, Observability,
  Hybrid, Summarization, Multi-agent). Selecting a preview draws its labelled box but
  **never fakes a run** (Constitution §3); `canSend` stays honest.
- **Pure à-la-carte (no presets)** — there are **no** Simple/Intermediate/Advanced
  preset buttons. The user starts from the minimal real skeleton and composes from
  there; the rung label is shown only as a **derived badge**.

## Goals

- **A component palette**, grouped by category (the 059 themes — RAG · Agent · AI-Ops ·
  Security · Scale — **repurposed as palette groups**, not canvas filters), where each
  component can be toggled on/off independently, subject to the structural rules below.
- **Two zones, honestly labelled** — *executes* vs *preview · won't run*. A preview
  component appearing in the selection adds its node to the canvas with its existing
  `comingSoon` treatment; it never contributes a `Stage` or affects a send.
- **An immutable real skeleton** that is always present (any agent run needs it):
  Frontend, Backend, Agent runtime, LLM, App Database. Everything else is optional.
- **Structured choices, not a flat checklist:**
  - **Agent runtime is a radio** — exactly one of ReAct (real) · DeepAgents (real) ·
    Multi-agent (preview).
  - **Retrieval** — Vector RAG is an optional component; the **reranker** (real) and
    **Hybrid Search** (preview) are *additive sub-options that require Vector RAG*;
    **RAGLESS / PageIndex** (real) is an *alternative* retrieval path that can run
    alongside for comparison.
  - **AI-Ops** (Gateway, Guardrails, Cache, Eval, Observability) are **independent
    checkboxes** (all preview today).
  - **Dependencies are enforced** — e.g. a reranker/Hybrid toggle is disabled unless
    Vector RAG is on; turning RAG off clears its sub-options.
- **Maturity becomes a derived badge** — `classify(selection) → simple | intermediate |
  advanced` (the highest floor among selected components wins), shown as a label, never
  as an input.
- **Real toggles are decoupled from the `scenario` enum** — the backend behaviours that
  today key off `scenario == "intermediate"` (reranker, DeepAgents, the RAGLESS gate)
  move to **per-feature request inputs**, so "Simple base + reranker" or "ReAct +
  Hybrid" are expressible without flipping a coarse rung.
- **The default selection reproduces today's Simple byte-for-byte** — first load = the
  real skeleton + Vector RAG + MCP Tools (today's `simple` station set), so an untouched
  app behaves exactly as it does now, and its derived badge reads *Simple*.
- **The canvas renders exactly the selected set** and reflows (existing layout machinery
  already takes an explicit visible set + flags).
- All new prose **bilingual** (en + pt) — §4; any new station/tier keeps a full
  `clouds.{azure,aws,gcp}` map — §5.

## Non-goals

- **Building the preview components for real.** Gateway, Guardrails, Cache, Eval,
  Observability, Hybrid, Summarization and the Multi-agent runtime stay `comingSoon`;
  each becomes real in its own future spec. This spec only makes them *selectable*.
- **Removing the real skeleton** (Frontend/Backend/Agent/LLM/DB) — those are not toggles.
- **A shareable / saved library of compositions** (named, persisted scenarios) — parked.
- **Changing what each real component does** — the reranker, RAGLESS and DeepAgents keep
  their current behaviour; only their *gating* moves off the `scenario` enum.

## User-facing behavior

The header's *Simple · Intermediate · Advanced* segmented control and the *All · RAG
Quality · …* track switcher are **replaced** by a **"Build your scenario"** affordance: a
panel/palette listing the components grouped by category, each with a toggle. Two visual
zones make the *executes* vs *preview · won't run* split obvious. The agent runtime is a
small radio (ReAct / DeepAgents / Multi-agent). Dependent toggles are disabled with a
bilingual hint until their prerequisite is on (e.g. "requires Vector RAG"). As the user
toggles, the canvas adds/removes nodes and reflows, and a **maturity badge** updates live
("Simple" → "Intermediate" when an intermediate-grade component is added). Sending a
message runs **only the real, enabled** components; preview nodes sit on the canvas
clearly labelled as not-yet-executing. *(All new prose ships en + pt — §4.)*

## Acceptance criteria

> Mix of Vitest (palette/derive/layout/classification — frontend) and pytest (the new
> per-feature backend inputs, asserted structurally against real OpenAI per §9).

1. **AC1 — default == today's Simple, byte-for-byte.** With no user interaction, the
   visible station set equals today's `simple` set (`frontend, backend, agent, rag, mcp,
   llm, database`), the agent runtime is ReAct, and the derived badge reads *Simple*. A
   request built from the default selection carries the same effective inputs as today's
   `scenario=simple` request (no reranker, no DeepAgents, no RAGLESS).
2. **AC2 — components toggle independently.** Enabling exactly one component (e.g.
   reranker) over the default yields the default set **+** that component and nothing
   else; disabling it returns to the default set.
3. **AC3 — derived maturity.** `classify(selection)` returns the highest floor among the
   selected components: default → `simple`; default + reranker (or Hybrid, or
   Summarization) → `intermediate`; default + any AI-Ops component (or Multi-agent) →
   `advanced`. Adding a higher-floor component raises the badge; removing it lowers it.
4. **AC4 — agent runtime is a radio.** Exactly one of `react | deepagents | multiagent`
   is selected at any time; selecting one deselects the others. `multiagent` reveals the
   sub-agent preview nodes; `deepagents` is real (executes), `multiagent` is preview.
5. **AC5 — dependencies enforced.** The reranker and Hybrid toggles are unavailable
   (disabled) unless Vector RAG is enabled; turning Vector RAG off clears them. RAGLESS
   may be enabled independently of Vector RAG (alternative path).
6. **AC6 — preview honesty (§3).** No `comingSoon` component contributes a `Stage`;
   `STAGE_TO_STATION` / `STAGE_TO_PHASE` stay total over the unchanged `Stage` enum.
   `canSend` is true whenever the real skeleton is intact (it always is), and a run emits
   no events for any preview node selected.
7. **AC7 — real toggles drive the backend per-feature.** With reranker enabled (and
   `scenario` no longer chosen by the user), a chat run actually reranks (the
   `rag.rerank` sub-stage fires); with DeepAgents selected, the DeepAgents preamble
   fires; with neither, neither fires — each gated by its own request input, **not** by a
   rung enum.
8. **AC8 — canvas reflects the selection and reflows.** `computeLayout` over the selected
   set positions exactly the enabled stations, every tier box wraps its present members,
   empty tiers are omitted, and the boundary recomputes — collision-free.
9. **AC9 — bilingual + cloud map.** Every new piece of user-facing prose (palette labels,
   zone headers, dependency hints, badge text) ships `en` + `pt`; any new station/tier
   fills `clouds.{azure,aws,gcp}`.

## Protocol / stage impact

§1 & §6 — **this is the load-bearing change** and the reason it is a feature, not a tweak.

- **No new executing `Stage`/`Phase`/`TraceEvent`** — the real behaviours
  (reranker, RAGLESS, DeepAgents) already have their stages; preview components carry
  `stages: []`. Totality of `STAGE_TO_STATION` / `STAGE_TO_PHASE` is preserved.
- **`ChatRequest` request-only inputs change (the decoupling) — clean break (clarify):**
  the `scenario` field is **removed** from `ChatRequest`. The behaviours that today read
  `scenario == "intermediate"` move to **explicit per-feature inputs**: `rerank: bool`
  (replaces the `retriever.py` `scenario == "intermediate"` gate), an agent `runtime`
  enum `react | deepagents | multiagent` (replaces the `graph.py` DeepAgents gate), and
  the existing `ragless: bool` (its gate drops the `and scenario == "intermediate"`
  clause). Every backend test asserting on `scenario` is rewritten in this spec. Mirror
  in `schemas.py` ⇄ client types accordingly.
- **`stations.ts` visual model:** no necessarily-new station ids (the preview nodes
  already exist from 008/059/060); the **selection set replaces `scenario`/`track` as the
  input to `visibleStationsFor` / `computeLayout`**. `relabelAgentForScenario` (the
  ReAct/DeepAgents/Multi label marker) is driven by the runtime radio instead of the rung.
- **008 + 059 superseded:** the global `scenario` store (as a *selector*) and the `track`
  store (as a *canvas filter*) are retired/repurposed. Their invariants that must survive:
  *Simple-equivalent default is byte-for-byte* and *a non-executing node never fakes a run*.

## Open questions (resolved 2026-06-17)

- [x] **Backend input shape → clean break.** `scenario` is **removed** from
  `ChatRequest`; behaviour moves to per-feature inputs (`rerank: bool`, `runtime` enum,
  existing `ragless`). Backend tests asserting on `scenario` are rewritten here.
- [x] **Selection state → global (localStorage).** One app-wide selection, persisted in
  the browser, mirroring today's `scenario`/`track` stores it replaces; sent on each
  request. (Trade-off accepted: a started conversation can drift if re-toggled later.)
- [x] **RAG + MCP → removable, default-on.** Fixed skeleton = Frontend/Backend/Agent/
  LLM/DB; Vector RAG and MCP Tools are optional but enabled by default, so the default
  selection == today's Simple set and a leaner agent (no retrieval / no tools) is
  expressible.
- [x] **MCP per-tool toggle (006) → layered.** The palette toggles the **whole MCP tool
  service** on/off; per-tool selection (`enabled_tools`) stays in Settings, unchanged.
- [x] **Classification floors → from `scenarios[]`.** Each component's maturity floor is
  read from its existing station `scenarios[]` membership (lowest rung it belongs to);
  `classify` returns the highest floor across the selection.
- [x] **Builder location → header popover.** Opens from where the Simple/Intermediate/
  Advanced segmented control + track switcher were; both are removed.
- [x] **Learn/roadmap → minimal now.** Only the prose AC9 strictly requires ships now;
  the full maturity-ladder narrative rewrite is deferred.

## Out of scope / deferred

- Real implementations of any preview component (each its own spec).
- Saved/named/shareable compositions and a preset *library* (the user chose pure
  à-la-carte; presets explicitly rejected for now).
- A real Multi-agent runtime and per-sub-agent activation.
- Rewriting the full Learn maturity-ladder narrative beyond what AC9 strictly requires.
