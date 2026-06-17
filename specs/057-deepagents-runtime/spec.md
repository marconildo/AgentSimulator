# Spec: DeepAgents runtime (planner + sub-agents + virtual file system)

| | |
|---|---|
| **ID** | 057-deepagents-runtime |
| **Status** | draft → clarified → planned → in-progress → **done** |
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

1. **AC1 (planning with status)** — `write_todos` is advertised on Intermediate (not on
   Simple); when called it emits `agent.plan` carrying `todos` (`{content, status}`) +
   `steps`, recorded in `AgentState["plan"]`; re-calling it updates item statuses
   (`pending`/`in_progress`/`completed`). *(tool-driven, not a forced preamble.)*
2. **AC2 (virtual FS is real)** — `write_file` then `read_file` on the same path returns
   what was written; `edit_file` replaces in place; `ls` lists the files; a missing read/
   edit is a typed `error:`/`found: false`.
3. **AC3 (real sub-agent)** — `task` spawns a **bounded sub-agent** (own system prompt +
   tool subset + thread + ReAct loop) that uses ≥1 tool, emits `agent.delegate` with a
   non-empty `result` and a `steps` tool-trail, and returns **only** its result to the lead
   agent (context quarantine — the sub-agent's intermediate messages never enter the lead
   thread).
4. **AC4 (new stages, protocol)** — New `Stage`s (`agent.plan`, `agent.fs.read`,
   `agent.fs.write`, `agent.delegate`) are added in `schemas.py`, mirrored in `events.ts`,
   and mapped in `STAGE_TO_STATION` **and** `STAGE_TO_PHASE` (totality; `tsc` clean).
5. **AC5 (drill-in shows plan + FS)** — The Agent drill-in renders the plan steps and the
   virtual-FS contents from real trace events (pure projection).
6. **AC6 (model-driven, not scripted)** — On `scenario=intermediate` a **greeting elects
   none** of the DeepAgents tools (the model just answers); `scenario=simple` is never even
   offered them, so its event sequence + answer path are byte-for-byte with today.

   > **Amended (2026-06-17):** the original "RAGLESS (056) takes precedence over
   > DeepAgents (the tools are suppressed when it's on)" rule was **reversed** — the
   > two seams are independent and now **compose**. The DeepAgents tools stay
   > available regardless of RAGLESS; RAGLESS only swaps what the retrieval tool
   > grounds on (PageIndex vs the vector pipeline). See `_with_deepagents` in
   > `graph.py` and `test_deepagents.py::test_deepagents_gated_to_deepagents_runtime_and_composes_with_ragless`.
7. **AC7 (bilingual)** — Every new user-facing string exists in `en` and `pt`.

## Protocol / stage impact

- **Several new `Stage`s** (`agent.plan`, `agent.fs.read`, `agent.fs.write`,
  `agent.delegate`, …; finalized at clarify), each mirrored in `events.ts` and mapped in
  `STAGE_TO_STATION` + `STAGE_TO_PHASE`. **Feature → protocol change (§1), the biggest of
  the ladder.**
- The `agent`/sub-agent stations already exist (`stations.ts`); the relabel marker
  (`AGENT_SCENARIO_LABEL`) becomes backed by a real runtime.

## Open questions — RESOLVED (clarify, 2026-06-11)

- [x] **Framework.** **Hand-built on the existing LangGraph loop.** Keeps the
      "everything is real and inspectable" property (§3) and avoids a heavy dependency;
      planner + virtual FS + the researcher sub-agent are plain async code emitting real
      trace stages (the same self-contained pattern as `rag/pageindex.py` from 056).
- [x] **Virtual FS shape.** A simple in-memory `dict[path -> content]` carried in
      `AgentState` (`vfs`), Skills-style (see [027-skills]). Per-run working memory; not
      persisted to the DB across turns.
- [x] **Sub-agent scope.** **One real delegated worker** — a **researcher** that runs
      retrieval and returns a short digest. The researcher/coder/critic trio is the
      Advanced rung's job (a later spec), explicitly out of scope here.
- [x] **Determinism / testing.** Planner + researcher output is model-variable → assert
      **structurally** (a plan exists with ≥1 step; an FS write is later read back with the
      same content; a delegation occurred; Simple emits none of it), per §9.
- [x] **Rung.** **Intermediate "DeepAgents"** only. The Advanced "DeepAgents +
      Multi-agents" orchestration stays a separate later spec.

## Design summary (locked)

> **Amendment 1 (post-review).** First cut was a **forced preamble node** (plan→delegate→
> retrieve before `think`), so a greeting triggered RAG. Reworked to **tool-driven** — the
> preamble node was deleted.
>
> **Amendment 2 (post-review).** "Tools in a loop" still wasn't the DeepAgents *architecture*
> (the user showed a real `deepagents` LangSmith trace: a middleware stack with
> TodoList / SubAgent / Filesystem). Chosen path: **hand-build the four pillars** on our
> instrumented graph (keeps the whole visualizer; the library would be a black box). The
> defining additions: **real sub-agents** (`task` spawns a bounded sub-agent with its own
> context/tools — context quarantine), a **todo list with per-item status**, and a full
> **virtual file system** with `edit_file`.
>
> **Amendment 3 (post-review — "make it behave like a DeepAgent by default").** Having the
> tools wasn't enough — the agent still ran like ReAct because planning was *optional and
> unreinforced*. Fixed the **behavior**, the real differentiator: (a) the live plan +
> file list are **re-injected into the model's context every `think` round**
> (`deepagents_state_block` in `_effective_system`) — the `TodoListMiddleware` feedback loop
> that makes a plan *stick*; (b) `DEEPAGENTS_PROMPT` now **mandates** `write_todos` first for
> any real task (only a bare greeting is exempt); (c) the Intermediate loop gets more
> iteration headroom (`DEEPAGENTS_MAX_ITERATIONS=8`, `recursion_limit=50`). Result: a real
> task **plans first** (pinned by `test_real_task_on_intermediate_plans_first`). *This is the
> ReAct → DeepAgent line: not tool count, but a harness that reinforces planning/state.*

DeepAgents is **tool-driven** and **hand-built**. On `scenario == "intermediate"`
(independent of RAGLESS — the two **compose**; see the AC6 amendment above) the agent is
offered six **native tools** (advertised in `agent/tools.py`, gated by `with_deepagents`), plus a
detailed `DEEPAGENTS_PROMPT` addendum on its role layer. The graph topology is the
**unchanged** ReAct loop (`route → think ⇄ tools → generate → respond`); the tools fire from
`tools_node` when the model calls them. The **four pillars**:

1. **Planning** — `write_todos` maintains an ordered todo list with per-item *status*
   (`pending`/`in_progress`/`completed`) in `AgentState["plan"]` → `agent.plan` (data:
   `todos` + `steps`). The agent re-calls it to advance statuses.
2. **Virtual file system** — `write_file` / `read_file` / `edit_file` / `ls` over
   `AgentState["vfs"]` (in-memory `dict`) → `agent.fs.write` / `agent.fs.read`.
3. **Sub-agents** — `task(description, subagent_type)` spawns a **real bounded sub-agent**
   (`run_subagent`): its own system prompt, tool subset, message thread and ReAct loop
   (`SUBAGENT_MAX_ITERS`). Only its final result returns to the lead agent (**context
   quarantine**) → `agent.delegate` (data: `result`, `steps`, `rounds`) wrapping the
   sub-agent's nested tool stages (its retrieval animates the RAG station).
4. **Detailed prompt** — `DEEPAGENTS_PROMPT` tells the lead agent how/when to use all of
   the above, and to skip them for trivial requests.

All four new stages map to the existing **`agent`** station (no new station/tier). A
greeting elects none of them. **Deferred:** the library's *summarization* middleware (a
context-compaction optimization, would add a `Stage`) and the Advanced researcher/coder/
critic sub-agent trio (a later spec; `_SUBAGENT_PROMPTS` is the seam).

## Out of scope / deferred

- Advanced-rung multi-agent orchestration (`DeepAgents + Multi-agents`).
- Persisting the virtual FS to the relational DB across turns.
- Arbitrary user-defined agent graphs / topologies.
