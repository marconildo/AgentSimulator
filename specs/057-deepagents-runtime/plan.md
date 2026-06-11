# Plan: DeepAgents runtime (planner + sub-agents + virtual file system)

> The HOW. `spec.md` is `clarified`. Every decision here respects
> `.specify/constitution.md` (no amendment needed — Simple stays byte-for-byte, single
> provider OpenAI, everything real, single-instance).

## Approach

> **Amendment 2026-06-11 (post-review).** Shipped first as a **forced preamble node**
> (below), then reworked to **tool-driven** after the user flagged that a scripted
> preamble isn't a DeepAgents structure (a greeting triggered planning + RAG). The
> **shipped** design: the five DeepAgents capabilities are **native tools** (`write_todos`,
> `write_file`, `read_file`, `ls`, `delegate_research`) advertised on the Intermediate rung
> (gated by `with_deepagents`, suppressed when RAGLESS is on), plus a `DEEPAGENTS_PROMPT`
> addendum on the role layer. The graph topology is the **unchanged** ReAct loop
> (`route → think ⇄ tools → generate → respond`); the tools fire from `tools_node` when the
> model elects them, mutating `AgentState["vfs"]`/`["plan"]` and emitting the same four
> stages. A greeting elects none. Test surface: deterministic keyless handler + gating
> tests, plus `@openai` greeting/Simple negatives. The preamble node was deleted.

**Superseded original approach (forced preamble):** Hand-built on the existing LangGraph
loop. A single **`deepagents` node** between `route` and `think`, a no-op off Intermediate,
that orchestrated:

```
START → route → deepagents → think ⇄ tools → generate → respond → END
                   │ (intermediate only)
                   ├─ agent.plan        one structured LLM call → ordered steps
                   ├─ agent.fs.write    write plan.md to the virtual FS
                   ├─ agent.delegate    researcher sub-agent: real rag_retrieve + LLM digest
                   ├─ agent.fs.write    write research.md to the virtual FS
                   └─ agent.fs.read     read the scratchpad back → fold into the thread
```

The runtime lives in a self-contained module `backend/app/agent/deepagents.py` (the same
shape as `rag/pageindex.py`): plain async functions that make their own `ChatOpenAI`
calls and emit real trace stages through the threaded `TraceEmitter`. The virtual FS is a
plain `dict[str, str]` carried in `AgentState["vfs"]`; the plan is `AgentState["plan"]`.
The researcher reuses the existing `rag_retrieve` so its retrieval honestly animates the
RAG station. The plan + research digest fold into the canonical thread as one scratchpad
`HumanMessage`, so the ReAct loop reasons over them (AC3 hand-off).

**Alternatives considered.** A `deepagents` library (rejected: hides the mechanics, heavy
dep, harder structural asserts — clarify). Splitting plan/delegate/fs into separate graph
nodes (rejected for now: one node keeps the graph diff minimal and the topology readable;
each step is still its own trace stage, which is what the drill-in and tests read).

## Affected files

**Backend**
- `backend/app/schemas.py` — 4 new `Stage` members (`AGENT_PLAN`, `AGENT_FS_WRITE`,
  `AGENT_FS_READ`, `AGENT_DELEGATE`).
- `backend/app/agent/deepagents.py` — **new**: planner, virtual FS read/write, researcher
  sub-agent, and `run_deepagents(state, emitter, provider)` orchestrator.
- `backend/app/agent/state.py` — add `plan: list[str]` and `vfs: dict[str, str]`.
- `backend/app/agent/graph.py` — `deepagents_node` (gated on intermediate); wire
  `route → deepagents → think`; initialize `plan`/`vfs` in `run_agent_state`.

**Frontend**
- `frontend/src/types/events.ts` — mirror the 4 new `Stage`s; add `DeepAgentsPlan` /
  `VfsFile` read shapes (additive, like 007/036).
- `frontend/src/lib/stations.ts` — add the 4 stages to the `agent` station's `stages`
  array (so `STAGE_TO_STATION` stays total).
- `frontend/src/lib/phases.ts` — map the 4 stages to the `reason` phase (totality).
- `frontend/src/lib/deepagents.ts` — **new**: pure `derivePlan(events)` + `deriveVfs(events)`.
- `frontend/src/components/AgentDetail.tsx` — **Plan** + **Virtual file system** panels
  (pure projection from events).
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor("agent")` shows `planned N steps`
  on intermediate runs (additive; no new StationId case).
- `frontend/src/i18n/strings.ts` — `agentDetail.plan*` / `agentDetail.vfs*` + readout, en+pt.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `AGENT_PLAN = "agent.plan"`, `AGENT_FS_WRITE = "agent.fs.write"`,
  `AGENT_FS_READ = "agent.fs.read"`, `AGENT_DELEGATE = "agent.delegate"`.
- `frontend/src/types/events.ts` — same 4 strings added to the `Stage` union.
- Emitted in: `backend/app/agent/deepagents.py` (driven by `deepagents_node` in `graph.py`).
- Mapped to station in `stations.ts`: all four → the existing **`agent`** station.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel): **no new `case`** — these
  switches are keyed by `StationId`, and `agent` already exists. The readout text gains a
  DeepAgents line; the drill-in gains the two panels.
- `STAGE_TO_PHASE` (phases.ts): all four → `reason` (totality; AC4).

## Data model changes

None. The virtual FS is per-run working memory in `AgentState` (clarify: not persisted to
the relational DB across turns). No Chroma / SQLite schema change.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `agentDetail.plan` | Plan | Plano |
| `agentDetail.planHint` | The orchestrator decomposes the task into ordered steps before reasoning. | O orquestrador decompõe a tarefa em passos ordenados antes de raciocinar. |
| `agentDetail.planEmpty` | No plan this run (Simple rung runs the bounded ReAct loop). | Sem plano nesta execução (o degrau Simples roda o loop ReAct limitado). |
| `agentDetail.vfs` | Virtual file system | Sistema de arquivos virtual |
| `agentDetail.vfsHint` | Scratchpad files the agent wrote and read back across steps. | Arquivos de rascunho que o agente escreveu e releu entre passos. |
| `agentDetail.vfsEmpty` | No files written this run. | Nenhum arquivo escrito nesta execução. |
| `agentDetail.delegated` | Delegated to researcher | Delegado ao pesquisador |
| `agentDetail.wrote` / `read` | wrote / read | escreveu / leu |
| `readout.agent.planned` (fn) | `planned {n} steps` | `planejou {n} passos` |
| glossary `DeepAgents` | (exists) drop the "Planned — not yet implemented" flag | (idem) |

## Cloud map (constitution §5)

n/a — no new tier/station. The four stages ride the existing `agent` station, whose
`clouds` map is already filled.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 planner fires (intermediate) / not (simple) | drive `run_deepagents`; assert `agent.plan` END with ≥1 step on intermediate; run the graph on simple and assert no `agent.*` deepagents stages | `backend/tests/test_deepagents.py` |
| AC2 virtual FS real | the `agent.fs.read` END content equals an earlier `agent.fs.write` END content (same path) | `backend/tests/test_deepagents.py` |
| AC3 sub-agent delegation | an `agent.delegate` END fires with a non-empty digest; the scratchpad message is in the final thread | `backend/tests/test_deepagents.py` |
| AC4 protocol + totality | `tsc --noEmit` (STAGE_TO_PHASE / STAGE_TO_STATION are `Record<Stage,…>`); a schema-mirror assertion | tsc build + `phases.test.ts` |
| AC5 drill-in projection | `derivePlan` / `deriveVfs` return the steps + files from a synthetic event log | `frontend/src/lib/deepagents.test.ts` |
| AC6 Simple unchanged | a `scenario=simple` run emits none of the 4 stages and the stage sequence matches today | `backend/tests/test_deepagents.py` |
| AC7 bilingual | every new key present in both `en` and `pt` (existing i18n parity test) | strings + existing tests |

`[openai]`-marked backend tests (planner + researcher make real model calls); structural
assertions only, to tolerate model variability (§9).

## Risks / trade-offs

- **Latency / cost on Intermediate.** The preamble adds a planning call + a researcher
  retrieval + digest call. Acceptable: Intermediate is the "honest cost" rung, and it is
  opt-in (the user selects the rung). Simple is untouched.
- **Determinism.** Plan/digest are model-variable → all asserts are structural.
- **Thread shape.** The scratchpad is appended as a `HumanMessage`; two human turns in a
  row are tolerated by OpenAI and keep the hand-off honest (no fake tool call).
- **ragless interplay.** The researcher uses the vector `rag_retrieve` for grounding even
  when `ragless` is on; combining DeepAgents + RAGLESS is left to a later refinement.
- **Single-instance (§7).** `vfs`/`plan` are per-run in-process state — no shared-state
  assumption introduced.
