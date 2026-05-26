# Plan: Core agentic request pipeline

> Retroactive — describes the architecture as built. Reconciled with the code in
> `backend/app/` and the tests in `backend/tests/`.

## Approach

A single streaming endpoint runs a **LangGraph** ReAct loop and threads a
`TraceEmitter` through every node, so each stage emits typed events that are both
fanned out over SSE and stored for replay. The demo/OpenAI split lives behind the
`LLMProvider` ABC (Strategy) and the embeddings factory — everything else is real in
both modes. Two delivery contracts (stream / batch) share one pipeline; batch just
suppresses per-token events and returns the finished trace as one JSON.

Topology: `START → route → retrieve → think ⇄ tools → generate → respond → END`, with
`think` deciding whether to call tools and `_should_continue` looping back to `tools`
while there are pending calls and `iterations ≤ MAX_ITERATIONS (3)`.

## Affected files

**Backend**
- `app/main.py` — FastAPI: `POST /api/chat` (stream + batch), `GET /api/trace/{id}`,
  `/api/health`; wraps the run in the `BACKEND` stage and emits `db.read`/`db.write`.
- `app/agent/graph.py` — the compiled ReAct graph and its nodes.
- `app/agent/state.py`, `app/agent/prompts.py` — `AgentState`, system prompt.
- `app/schemas.py` — `Stage`, `Phase`, `TraceEvent`, `ChatRequest`, `TraceSummary`.
- `app/trace.py` — `TraceEmitter` (`stage()` context manager, `emit()`), `TraceStore`.
- `app/llm/provider.py` — `LLMProvider` ABC + `MockProvider` / `OpenAIProvider`.
- `app/rag/` — `ingest.py`, `retriever.py`, `embeddings.py`, `store.py`.
- `app/mcp/server.py`, `app/mcp/client.py` — FastMCP server + `ToolRegistry` (stdio with
  in-process fallback).
- `app/db/store.py` — `ConversationStore` (SQLite, the relational system of record).
- `app/config.py` — `Settings.is_demo`, `rag_top_k`, `app_db_path`.

**Frontend**
- `frontend/src/types/events.ts` — TS mirror of the protocol (constitution §1).
- (Rendering/projection is out of scope for this spec; see `spec.md`.)

## Protocol changes (constitution §1)

This spec *defines* the protocol rather than changing it. The 14 stages:
`frontend`, `backend`, `db.read`, `agent.route`, `agent.think`, `rag.embed`,
`rag.search`, `rag.retrieve`, `mcp.discover`, `mcp.call`, `llm.prompt`, `llm.generate`,
`respond`, `db.write`. Phases: `start` / `progress` / `end`. Mirrored in `events.ts`;
every stage maps to a station in `stations.ts` (constitution §6).

## Data model changes

Two distinct stores, on purpose (constitution §3):
- **Vector store** (Chroma, `ai_engineering`, cosine) — RAG embeddings; `similarity =
  1 - distance`. Built by `rag/ingest.py`, auto-built on startup if missing.
- **Relational store** (SQLite, `ConversationStore`) — the transactional record of
  conversations; `read_history()` / `write()` (idempotent per trace id) run via
  `asyncio.to_thread`.

## i18n strings (constitution §4)

No new backend strings. User-facing prose lives in the frontend visual model
(`stations.ts`, `learn/content.ts`) as `{ en, pt }` — out of scope for this backend spec.

## Cloud map (constitution §5)

No new tier/station introduced here. (Existing tiers/stations already carry
`generic` + `clouds: {azure, aws, gcp}`.)

## Test strategy (constitution §9 — TDD)

Each acceptance criterion maps to at least one existing test:

| AC | What it proves | Test | File |
|---|---|---|---|
| AC1 | Stable serialization + monotonic seq | `test_stage_and_phase_serialize_as_dotted_strings`, `test_all_stages_have_dotted_or_simple_ids`, `test_sequence_numbers_are_monotonic` | `test_protocol.py`, `test_agent.py` |
| AC2 | Full stage sequence | `test_pipeline_emits_all_core_stages` | `test_agent.py` |
| AC3 | Scored, ranked RAG + stages | `test_retrieve_returns_scored_chunks`, `test_retrieve_emits_rag_stages` | `test_rag.py` |
| AC4 | MCP discovery + execution + error | `test_registry_exposes_demo_tools`, `test_calculator_tool_executes`, `test_unknown_tool_is_handled` | `test_mcp.py` |
| AC5 | Tool-using query end to end | `test_math_question_invokes_calculator_tool` | `test_agent.py` |
| AC6 | Token streaming + done event | `test_llm_generate_streams_tokens`, `test_chat_streams_events_then_done_and_replays` | `test_agent.py`, `test_api.py` |
| AC7 | Batch one-shot, no progress, replayable | `test_batch_returns_full_trace_in_one_json_response` | `test_api.py` |
| AC8 | History folded into prompt + memory_turns | `test_history_is_carried_into_the_prompt` | `test_agent.py` |
| AC9 | DB roundtrip + idempotent + stages emitted | `test_write_then_read_roundtrip`, `test_write_is_idempotent_per_trace`, `test_chat_emits_database_stages` | `test_db.py`, `test_api.py` |
| AC10 | Replay by id + 404 | `test_chat_streams_events_then_done_and_replays`, `test_unknown_trace_returns_404` | `test_api.py` |
| AC11 | Offline demo mode | `test_health_reports_demo_mode` (+ `conftest.py` forces `DEMO_MODE`) | `test_api.py`, `conftest.py` |

## Risks / trade-offs

- **Single-instance** trace + memory state — explicitly accepted (constitution §8).
- **Determinism** depends on the mock provider/embeddings; tests must keep
  `DEMO_MODE=true`.
- **MCP transport** can fall back to in-process; behavior is identical by design, but the
  `transport` field is surfaced so it's never silent.
