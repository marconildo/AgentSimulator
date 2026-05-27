# Plan: Agent tool autonomy — canonical ReAct (retrieval as a tool)

> The HOW. Written after `spec.md` is `clarified`. Decisions respect
> `.specify/constitution.md`.

## Approach

Re-architect the Simple-scenario agent from its custom "decide-then-stuff-the-
system-prompt" loop into the canonical LangGraph tool-calling loop, **without
adding or removing any `Stage`** so the visual model and both exhaustive maps are
untouched.

Three moves:

1. **A canonical message thread.** `AgentState` gains
   `messages: Annotated[list[AnyMessage], add_messages]` (the LangGraph reducer).
   The model is called on the *running thread*; its `AIMessage(tool_calls=…)` is
   appended; tool results return as `ToolMessage`s appended to the thread. No more
   re-sending `[human(message)]` each round and concatenating results into the
   system prompt. This is what makes the LangSmith trace show the standard
   `human → ai(tool_calls) → tool → ai(final)` chain and match the reference agent.

2. **Retrieval becomes a tool.** Delete the unconditional `retrieve` node. Add a
   native agent tool `search_knowledge_base(query)` to the tool list advertised to
   the model. When the agent elects to call it, the tools node runs the **real**
   RAG pipeline (`rag.retrieve`, emitting `rag.embed`/`rag.search`/`rag.retrieve`)
   and returns the retrieved context as a `ToolMessage`. So `rag.*` fires only on
   an agent decision, and the RAG station animates as a *consequence* of a
   tool-call — not a fixed edge.

3. **One agent loop, two faces.** Keep `think` and `generate` as distinct stages
   (so `agent.think`/`llm.prompt` and `llm.generate` fire exactly when they do
   today):
   - `think`: `model.bind_tools(tools).ainvoke(thread)` → emit `AGENT_THINK`
     (+ nested `LLM_PROMPT`, usage). If `tool_calls` → append the AIMessage, route
     to `tools`. If none → it's a "decide to answer" round (discarded content,
     exactly like today's throwaway `decide`); route to `generate`.
   - `tools`: a `ToolNode`-style executor. For each pending call, dispatch
     `search_knowledge_base` → RAG pipeline (emits `rag.*`); any MCP tool →
     `registry.call` (emits `mcp.call`). Append a `ToolMessage` per result. Loop
     back to `think`.
   - `generate`: `model.astream(thread)` → stream the final answer token by token
     (emit `LLM_GENERATE` PROGRESS in stream mode, one-shot in batch), append the
     final AIMessage, route to `respond`.

   New topology: `START → route → think ⇄ tools → generate → respond → END`
   (the `retrieve` node is gone; retrieval lives inside `tools`). `route` still
   emits `AGENT_ROUTE` + `MCP_DISCOVER` (now listing the retrieval tool too).

This preserves the two-model-call final structure (decide → stream) that 011
token/cost already accounts for, and keeps every emission point the inspector and
timeline rely on.

### Alternatives considered

- **`create_react_agent` (prebuilt).** Rejected: it owns the loop and would strip
  the per-stage `TraceEmitter` instrumentation the visualizer is built on. We keep
  a hand-rolled `StateGraph` so each station still animates.
- **Streaming the decision round to unify think/generate into one call.** Rejected
  for now: more fragile (disambiguating tool-call vs content mid-stream) and would
  change the trace's call count. The decide→stream pair matches today 1:1.
- **Retrieval as an MCP server tool.** Rejected: the stdio MCP server has no access
  to the app's Chroma store / per-session document scoping; retrieval stays a
  native agent tool that animates the RAG station (not `mcp.call`).

## Affected files

**Backend**
- `backend/app/agent/state.py` — add `messages` (add_messages reducer); keep
  request-only fields (`session_id`, `top_k`, `mode`, `system_prompt`,
  `enabled_tools`, `scenario`, `simulate_failure`, `history`) and display mirrors
  (`chunks`, `used_tools`, `tool_results`); drop `pending_tool_calls` and `context`
  (retrieval context now flows as a `ToolMessage`).
- `backend/app/agent/graph.py` — remove `retrieve_node`; rewrite `think`/`tools`/
  `generate` for the canonical thread; new edges; preserve 017 degrade paths.
- `backend/app/agent/tools.py` *(new)* — assemble the full tool list
  (`search_knowledge_base` + MCP specs), the OpenAI tool schemas, and a dispatcher
  the tools node uses (retrieval → RAG pipeline, others → `registry.call`). Single
  source of truth shared by the graph and `GET /api/config`.
- `backend/app/llm/provider.py` + `openai_provider.py` — keep the ABC seam (§2) but
  make it thread-aware: a `bind(tools)`/`ainvoke(thread)` decision call and a
  `stream(thread)` final-answer call operating on `list[AnyMessage]`. `_build_messages`
  no longer stuffs tool results / forced context into the system prompt; the system
  block keeps only the prompt + long-term-memory history.
- `backend/app/main.py` — `GET /api/config` tool list now includes
  `search_knowledge_base`; `run_agent` call unchanged in signature.
- `backend/app/rag/retriever.py` — unchanged (the tool wraps the existing
  `retrieve`); confirm it still emits `rag.*` through the passed emitter.

**Frontend**
- `frontend/src/lib/stations.ts` — fix the `agent` station `blurb` + the `flow`
  tech row (no longer "retrieves context, then loops"); reword to the autonomous
  tool-calling loop (en + pt). No `STAGE_TO_STATION` change.
- `frontend/src/lib/derive.ts` — verify the projection tolerates a run with **no**
  `rag.*` events (retrieval skipped) and an Agent→RAG hop that only appears on
  retrieval; add a regression test rather than logic changes if it already does.
- No change to `events.ts`, `phases.ts`, `readoutFor`, `renderDetail` (no new
  `Stage`/station).

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent` added or changed, so no `events.ts`
mirror change. `rag.*` and `mcp.call` keep their station/phase mappings; they
become *conditional* (fire only when the agent calls the corresponding tool). The
parity tests (`STAGE_TO_STATION`, `STAGE_TO_PHASE`) must stay green unchanged
(AC7).

## Data model changes

None. Same Chroma collection, same SQLite `ConversationStore`. The retrieval tool
reuses the existing `rag_retrieve` (same `top_k`, same per-session scoping).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `stations.ts` agent `blurb` | "A LangGraph state machine on a private network. It reasons in a loop: decide whether to call a tool — search the knowledge base, run a calculation, look up the time — observe the result, and reason again, until it can answer. The agent owns every tool-call decision." | "Uma máquina de estados LangGraph em rede privada. Raciocina em loop: decidir se chama uma ferramenta — buscar na base de conhecimento, calcular, consultar a hora — observar o resultado e raciocinar de novo, até poder responder. O agente decide cada chamada de ferramenta." |
| `stations.ts` agent `tech` flow value | `reason ⇄ tools (search KB · calc · …) → answer` | (proper-noun/code string — same both langs) |
| retrieval tool UI gloss (discover readout) | "Search the knowledge base (vector RAG) for context relevant to the query." | "Busca na base de conhecimento (RAG vetorial) por contexto relevante à pergunta." |

> The retrieval tool's *functional* description sent to the model is a single
> English functional string (like protocol/proper-noun strings); the **UI-facing**
> gloss above ships en + pt. Confirm during implementation how the discover readout
> renders MCP descriptions and match that pattern.

## Cloud map (constitution §5)

n/a — no new tier/station. The retrieval tool animates the existing `rag` station,
whose cloud map (Azure AI Search / Amazon OpenSearch / Vertex AI Vector Search) is
already filled.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 advertise retrieval tool | discover event + `/api/config` list contains `search_knowledge_base` | `backend/tests/test_agent_thread.py` (new), `backend/tests/test_config.py` |
| AC2 no retrieval without decision | math query emits **no** `rag.*` events | `backend/tests/test_agent.py` |
| AC3 KB question retrieves via decision | corpus query → retrieval tool-call decision precedes `rag.*`; answer non-empty | `backend/tests/test_agent.py` |
| AC4 canonical thread | final thread has `AIMessage.tool_calls` + matching `ToolMessage`; system prompt has no "# Tool results" block | `backend/tests/test_agent_thread.py` |
| AC5 MCP tools as decisions | math+calculator → `calculator` used, correct answer (existing assertions) | `backend/tests/test_agent.py` |
| AC6 bounded + always answers | loop ≤ `MAX_ITERATIONS`, non-empty answer + `respond` event | `backend/tests/test_agent.py` |
| AC7 visual-model parity | `STAGE_TO_STATION`/`STAGE_TO_PHASE` parity tests; derive tolerates no-`rag` run | `frontend/.../phases.test.ts`, `frontend/src/lib/derive.test.ts` |
| AC8 failure injection | `tool_error` → error `ToolMessage` + degraded answer; `llm_timeout` → fallback | `backend/tests/test_failure.py` |
| AC9 token/cost | each model call records usage/cost; multi-round totals > 1 round | `backend/tests/test_agent.py` (metrics asserts) |
| AC10 streaming & overrides | stream PROGRESS tokens; `enabled_tools=[]` → no tools & no `rag.*`; `system_prompt` replace | `backend/tests/test_agent.py`, `test_experiments` |

All `[openai]`-marked tests assert structurally and run against real OpenAI (CI
key). Keyless guard tests still run without a key.

## Risks / trade-offs

- **Determinism.** The model now *chooses* whether to retrieve; a KB question might
  occasionally not retrieve. Tests assert structurally (e.g. for a clearly-corpus
  question the answer is non-empty/grounded) and avoid over-pinning the decision.
- **Two model calls in the final phase.** Preserved from today (decide → stream);
  011 cost totals already expect this. Documented, not a regression.
- **Frontend "always retrieves" assumptions.** `deriveView`, the timeline (phases
  shown dimmed when absent), and the tour may assume a `retrieve` phase always
  fires. Audit + regression-test the no-retrieval run (AC7). The 022 message↔trace
  link and 019 citations read `chunks`, which are now present only on retrieval —
  verify they degrade gracefully when a turn didn't retrieve.
- **Provider seam.** Going thread-based touches the ABC; keep it minimal and
  OpenAI-only (§2). Ensure `usage_metadata` is still captured for 011.
- **`used_tools` de-dup.** Today `decide` filters already-used tools to avoid loops;
  the canonical loop relies on `MAX_ITERATIONS` + the model seeing prior
  `ToolMessage`s. Keep the iteration bound as the backstop (AC6).
