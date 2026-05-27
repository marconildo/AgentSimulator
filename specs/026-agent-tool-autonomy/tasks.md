# Tasks: Agent tool autonomy — canonical ReAct (retrieval as a tool)

> Ordered TDD checklist. Each implementation task is preceded by the test that
> should fail first (red → green → refactor). Check boxes as you go.

## Tasks

### Tool list + retrieval-as-tool (AC1, AC2, AC3)
- [x] **T1 — test first**: `test_agent_thread.py::test_config_advertises_retrieval_tool`
  + `test_agent.py::test_no_overrides_discovers_all_tools…` — `mcp.discover` END `tools`
  and `GET /api/config` include `search_knowledge_base` with a non-empty description.
- [x] **T2 — implement**: added `backend/app/agent/tools.py` — full tool-spec builder
  (`search_knowledge_base` + `registry.specs(enabled)`) + `is_retrieval` dispatcher;
  wired `route_node`'s discover and `GET /api/config` to it.
- [x] **T3 — test first**: `test_agent.py::test_math_question_skips_retrieval` —
  "What is 2 + 2?" emits **no** `rag.*` events.
- [x] **T4 — test first**: `test_agent.py::test_knowledge_question_retrieves_by_agent_decision`
  — a corpus-detail question emits a `search_knowledge_base` decision *before* `rag.*`.

### Canonical thread + loop rewrite (AC4, AC5, AC6)
- [x] **T5 — test first**: `test_agent_thread.py::test_tool_run_produces_canonical_thread`
  — the thread has `AIMessage.tool_calls` + a matching `ToolMessage`; the system prompt
  has no "# Tool results" block.
- [x] **T6 — implement**: `state.py` add `messages` (add_messages) + display mirrors
  (`context`/`chunks`/`used_tools`); dropped `pending_tool_calls`/`tool_results`.
- [x] **T7 — implement**: `provider.py`/`openai_provider.py` thread-aware `decide` +
  `stream_answer`; `_assemble` no longer stuffs tool results / forced context.
- [x] **T8 — implement**: `graph.py` — deleted `retrieve_node`; rewrote
  `think`/`tools`/`generate` on the thread; edges `route → think ⇄ tools → generate → respond`.
- [x] **T9 — verify**: `test_agent.py` tool-use + bounded-loop assertions (AC5, AC6)
  pass; `test_mcp.py` direct-node test updated to the canonical thread; calculator math correct.

### Regressions: failure, cost, streaming, overrides (AC8, AC9, AC10)
- [x] **T10 — verify**: `test_failure.py` green — `tool_error` feeds the error back as a
  `ToolMessage` + degraded answer; `llm_timeout` degrades + skips tools/generate; both keep
  `{error, simulated:true}` (`test_explicit_none_is_identical_to_omitting` re-pointed at a
  corpus-detail question so retrieval reliably fires).
- [x] **T11 — verify**: `test_llm_calls_carry_token_usage_and_cost` green (per-call usage; multi-round totals).
- [x] **T12 — verify**: streaming PROGRESS + `enabled_tools=[]` → no tools **and no `rag.*`**
  (`test_all_tools_disabled_makes_no_tool_calls`); system_prompt/top_k overrides green.

### Frontend parity + projection (AC7)
- [x] **T13 — test first**: `derive.test.ts` — "conditional retrieval (026 AC7)": a run
  with **no** `rag.*` events keeps the RAG station idle at every cursor and lights no rag hop.
- [x] **T14 — verify**: `phases.test.ts` + `stations.test.ts` parity tests stay green (242 Vitest pass).
- [x] **T15 — audit**: 019 `citations.test.ts` + 020 `turnDiff.test.ts` green — they read
  `chunks` defensively, so a turn that didn't retrieve degrades gracefully (no change needed).

### Docs / i18n / cleanup (constitution §4)
- [x] **T16 — i18n**: updated the `agent` station `blurb` + `flow` tech row (en + pt) and
  `route_node`'s plan text to the autonomous tool-calling loop.
- [x] **T17 — cloud map**: n/a — no new tier/station (retrieval animates the existing `rag` station).
- [x] **T18 — refactor**: removed the old system-prompt stuffing + `pending_tool_calls`/`tool_results`; tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format --check .` clean for all 026 files (pre-existing
  `tests/test_pricing.py` drift is unrelated to this spec)
- [x] `pytest -q` green — **111 backend tests pass** (with `OPENAI_API_KEY`)
- [~] `npm test` (Vitest) green — **242 tests pass**; `npm run build` (`tsc --noEmit`) is
  **blocked by an unrelated, in-flight spec 021 (abstain-badge) type error**
  (`abstain.test.ts` uses a `result` field absent from `ToolResultData`). All 026 code
  type-checks cleanly — the only `tsc` error is the 021 file, owned by its own session.
- [x] Protocol mirror — **unchanged** (no `Stage`/`events.ts` change); every `Stage`
  still mapped to a station + phase
- [x] All new user-facing text exists in en **and** pt
- [ ] A LangSmith trace of a tool-using run shows the canonical
  `human → ai(tool_calls) → tool → ai(final)` chain (verify in the live app — AC4 pins it structurally)
- [~] `spec.md` status → `done` **pending** the 021 build-gate fix (out of 026's scope)
