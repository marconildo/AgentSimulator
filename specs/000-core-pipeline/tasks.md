# Tasks: Core agentic request pipeline

> Retroactive checklist. The pipeline shipped in commits `c885c0c` → `ccdf55e`; this
> reconstructs the work as the TDD checklist it satisfies. Every box is checked because
> the guarding test (see `plan.md` → *Test strategy*) is green. Use this as the model
> for how a *new* feature's `tasks.md` should look — except a new feature starts with
> the boxes empty and the test written first.

## Tasks

- [x] **T1 — Protocol**: define `Stage`/`Phase`/`TraceEvent` and mirror in `events.ts`
      → guarded by `test_protocol.py` (AC1)
- [x] **T2 — Trace emitter**: `TraceEmitter.stage()` / `emit()` + `TraceStore`
      → exercised across `test_agent.py` / `test_api.py`
- [x] **T3 — RAG**: ingest + retriever returning scored, ranked chunks
      → `test_rag.py` (AC3)
- [x] **T4 — MCP**: FastMCP server + `ToolRegistry` with in-process fallback
      → `test_mcp.py` (AC4)
- [x] **T5 — Agent loop**: LangGraph `route → retrieve → think ⇄ tools → generate →
      respond` → `test_agent.py` AC2/AC5
- [x] **T6 — Streaming**: per-token `progress` events in stream mode
      → `test_agent.py` / `test_api.py` (AC6)
- [x] **T7 — Batch delivery**: one-shot JSON, no `progress`, still replayable
      → `test_api.py` (AC7)
- [x] **T8 — Long-term memory**: history folded into prompt + `memory_turns`
      → `test_agent.py` (AC8)
- [x] **T9 — Relational store**: `ConversationStore` roundtrip + idempotent per trace;
      `db.read`/`db.write` emitted → `test_db.py` / `test_api.py` (AC9)
- [x] **T10 — HTTP surface**: `/api/chat`, `/api/trace/{id}`, `/api/health`; replay + 404
      → `test_api.py` (AC10/AC11)
- [x] **T11 — Offline demo mode**: deterministic mock provider + embeddings; CI needs no
      keys → `conftest.py` forces `DEMO_MODE` (AC11)

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean
- [x] `pytest -q` green (offline, `DEMO_MODE=true`)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), every Stage mapped to a station
- [x] All user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
