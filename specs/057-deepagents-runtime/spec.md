# Spec: DeepAgents runtime (planner + sub-agents + virtual file system)

| | |
|---|---|
| **ID** | 057-deepagents-runtime |
| **Status** | **draft** → clarified → planned → in-progress → done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-11 |

> The heaviest Intermediate/Advanced-rung lift. Today the `agent` node is **relabelled
> "DeepAgents" on Intermediate as a label only** (`AGENT_SCENARIO_LABEL` in `stations.ts`)
> — the runtime is still the bounded ReAct loop from [026-agent-tool-autonomy]. This spec
> makes the DeepAgents pattern **real**: an explicit planner, sub-agents, and a virtual
> file system the agent reads/writes across steps.

## Problem / motivation

The ReAct loop is great for short, tool-using turns, but longer-horizon tasks need more:
a **plan** decomposing the task, **sub-agents** doing focused sub-tasks, and a
**scratchpad / virtual file system** that survives across steps (so intermediate work
isn't lost to the context window). This is the "DeepAgents" pattern. The canvas already
*promises* it (the relabelled node + glossary tooltip flagged "Planned — not yet
implemented"); this spec pays off that promise so the Intermediate rung teaches **how
agents actually scale to bigger tasks**, not just a relabel.

## Goals

- A **real planner**: before the ReAct loop, a node produces an explicit, inspectable
  **plan** (ordered steps) in `AgentState`, visible in the Agent drill-in.
- A **virtual file system** (in-memory scratchpad, Skills-style — see [027-skills]) the
  agent can **write** intermediate artifacts to and **read** back across steps, so work
  persists beyond a single prompt's context window.
- **Sub-agents**: the orchestrator delegates a focused sub-task to a worker agent (the
  Advanced rung already previews `researcher` / `coder` / `critic` sub-agent nodes,
  `comingSoon`); this spec wires at least the planner + FS + one real delegated sub-agent.
- The Agent drill-in **visualizes** the plan, the FS reads/writes, and the sub-agent
  hand-offs — composed from real trace events.

## Non-goals

- A full multi-agent orchestration framework / arbitrary agent graphs — start with the
  planner + virtual FS + a single delegated sub-agent; broaden later.
- Persisting the virtual FS across turns / to the DB — it's per-run working memory first.
- The Advanced-rung "DeepAgents + Multi-agents" orchestration (that's its own later spec);
  this targets the **Intermediate** "DeepAgents" relabel becoming real.
- Changing the Simple rung (it keeps the bounded ReAct loop, byte-for-byte).

## User-facing behavior

- On the **Intermediate** rung the agent runs the **DeepAgents** loop: a **plan** appears
  in the Agent drill-in before reasoning; as the run proceeds, **virtual-FS reads/writes**
  and any **sub-agent delegation** show as their own steps/events.
- The Agent "open full view" gains a **Plan** panel (ordered steps + status) and a
  **Virtual file system** panel (files written/read this run), alongside the existing
  working-memory / long-term-memory / context-window panels.
- Simple keeps the canonical ReAct loop with no plan / FS / sub-agents.
- All new prose ships **en + pt**; "DeepAgents" stays English in both (existing glossary).

## Acceptance criteria

1. **AC1 (planner fires on Intermediate)** — On `scenario=intermediate`, a multi-step task
   produces an explicit plan in `AgentState` before the first reasoning round; on
   `scenario=simple` no planner runs (byte-for-byte ReAct).
2. **AC2 (virtual FS is real)** — The agent can **write** an artifact to the virtual FS and
   **read** it back in a later step; the read returns what was written (structural test).
3. **AC3 (sub-agent delegation)** — The orchestrator delegates ≥1 sub-task to a worker
   sub-agent whose result is folded back into the orchestrator's thread (a visible
   hand-off in the trace).
4. **AC4 (new stages, protocol)** — New `Stage`s (e.g. `agent.plan`, `agent.fs.read`,
   `agent.fs.write`, `agent.delegate`) are added in `schemas.py`, mirrored in `events.ts`,
   and mapped in `STAGE_TO_STATION` **and** `STAGE_TO_PHASE` (totality; `tsc` clean).
5. **AC5 (drill-in shows plan + FS)** — The Agent drill-in renders the plan steps and the
   virtual-FS contents from real trace events (pure projection).
6. **AC6 (Simple unchanged)** — `scenario=simple` emits no plan/FS/delegate stages; its
   event sequence + answer path are byte-for-byte with today.
7. **AC7 (bilingual)** — Every new user-facing string exists in `en` and `pt`.

## Protocol / stage impact

- **Several new `Stage`s** (`agent.plan`, `agent.fs.read`, `agent.fs.write`,
  `agent.delegate`, …; finalized at clarify), each mirrored in `events.ts` and mapped in
  `STAGE_TO_STATION` + `STAGE_TO_PHASE`. **Feature → protocol change (§1), the biggest of
  the ladder.**
- The `agent`/sub-agent stations already exist (`stations.ts`); the relabel marker
  (`AGENT_SCENARIO_LABEL`) becomes backed by a real runtime.

## Open questions (clarify before planning)

- [ ] **Framework.** Build the planner + FS by hand on the existing LangGraph loop, vs.
      adopt a `deepagents`-style library / pattern. Hand-built keeps the "everything is
      real and inspectable" property and avoids a heavy dependency — recommended start.
- [ ] **Virtual FS shape.** A simple in-memory `dict[path -> content]` in `AgentState`
      (Skills-style, see [027-skills]) is enough to teach the concept.
- [ ] **Sub-agent scope.** One real delegated worker first (e.g. a "researcher" that runs
      retrieval and returns a digest), or the full researcher/coder/critic trio.
- [ ] **Determinism / testing.** Planner output is model-variable → assert **structurally**
      (a plan exists with ≥1 step; an FS write is later read; a delegation occurred), per §9.
- [ ] **Rung.** Intermediate "DeepAgents" first; the Advanced "DeepAgents + Multi-agents"
      orchestration is a separate later spec.

## Out of scope / deferred

- Advanced-rung multi-agent orchestration (`DeepAgents + Multi-agents`).
- Persisting the virtual FS to the relational DB across turns.
- Arbitrary user-defined agent graphs / topologies.
