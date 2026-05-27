# Tasks: Agent tool autonomy — canonical ReAct (retrieval as a tool)

> Ordered TDD checklist. Each implementation task is preceded by the test that
> should fail first (red → green → refactor). Check boxes as you go.

## Tasks

### Tool list + retrieval-as-tool (AC1, AC2, AC3)
- [ ] **T1 — test first**: `test_agent_thread.py::test_retrieval_advertised` — the
  `mcp.discover` END `tools` and `GET /api/config` list include `search_knowledge_base`
  with a non-empty description. (red)
- [ ] **T2 — implement**: add `backend/app/agent/tools.py` — full tool-spec builder
  (`search_knowledge_base` + `registry.specs(enabled)`) + execution dispatcher; wire
  `route_node`'s discover and `GET /api/config` to it. (green)
- [ ] **T3 — test first**: `test_agent.py::test_math_skips_retrieval` — "What is 2 + 2?"
  emits **no** `rag.embed`/`rag.search`/`rag.retrieve` events. (red)
- [ ] **T4 — test first**: `test_agent.py::test_kb_question_retrieves_by_decision` —
  a corpus question emits a retrieval tool-call decision, then `rag.*`, then a
  non-empty answer. (red)

### Canonical thread + loop rewrite (AC4, AC5, AC6)
- [ ] **T5 — test first**: `test_agent_thread.py::test_canonical_tool_thread` — after
  a tool-using run the message thread has an `AIMessage` with non-empty `tool_calls`
  and a following `ToolMessage`; the system prompt contains no "# Tool results" block. (red)
- [ ] **T6 — implement**: `state.py` add `messages` (add_messages) + display mirrors;
  drop `pending_tool_calls`/`context`. (green for T5 setup)
- [ ] **T7 — implement**: `provider.py`/`openai_provider.py` thread-aware decide +
  stream; `_build_messages` stops stuffing tool results / forced context. (green)
- [ ] **T8 — implement**: `graph.py` — delete `retrieve_node`; rewrite
  `think`/`tools`/`generate` on the thread; new edges
  `route → think ⇄ tools → generate → respond`. Makes T3–T5 pass. (green)
- [ ] **T9 — verify**: existing `test_agent.py` tool-use + bounded-loop assertions
  (AC5, AC6) pass unchanged or are updated to the canonical thread; calculator math
  still correct.

### Regressions: failure, cost, streaming, overrides (AC8, AC9, AC10)
- [ ] **T10 — test first / update**: `test_failure.py` — `tool_error` yields an error
  `ToolMessage` fed back to the model + degraded terminal answer; `llm_timeout` still
  degrades to the fallback and skips tools+generate; both keep `{error, simulated:true}`. (red→green)
- [ ] **T11 — verify**: token/cost metrics recorded per model call; a multi-round run
  totals > 1 reasoning round (AC9).
- [ ] **T12 — verify**: stream mode emits per-token `llm.generate` PROGRESS; batch
  one-shot; `enabled_tools=[]` → no tool calls **and no `rag.*`**; `system_prompt`
  override fully replaces default; `top_k` bounds retrieval when it happens (AC10).

### Frontend parity + projection (AC7)
- [ ] **T13 — test first**: `derive.test.ts` — a run with **no** `rag.*` events
  projects with the RAG station idle and the Agent→RAG hop absent; a retrieval run
  lights the RAG station after the tool-call. (red if logic needs a tweak)
- [ ] **T14 — verify**: `phases.test.ts` + `stations` parity tests
  (`STAGE_TO_STATION`, `STAGE_TO_PHASE`) stay green unchanged.
- [ ] **T15 — audit**: 019 citations + 022 message↔trace link degrade gracefully on a
  turn that didn't retrieve (no `chunks`); fix if they assume retrieval always ran.

### Docs / i18n / cleanup (constitution §4)
- [ ] **T16 — i18n**: update the `agent` station `blurb` + `flow` tech row and add the
  retrieval-tool UI gloss, en + pt (plan i18n table). `route_node` plan text updated.
- [ ] **T17 — cloud map**: n/a (no new tier/station) — confirm in the spec.
- [ ] **T18 — refactor**: remove dead code (old `decide` system-prompt stuffing,
  `pending_tool_calls`), tidy, keep tests green.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; keyless guard tests still run)
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` (Vitest) green
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`) — **unchanged here**;
  every `Stage` still mapped to a station + phase
- [ ] All new user-facing text exists in en **and** pt
- [ ] A LangSmith trace of a tool-using run shows the canonical
  `human → ai(tool_calls) → tool → ai(final)` chain (matches the reference agent)
- [ ] `spec.md` status updated to `done`
