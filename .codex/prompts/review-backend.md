---
description: Read-only review of backend (FastAPI + LangGraph + SQLite + MCP) changes against project conventions.
---

Review the current `backend/` change in **AgentSimulator** against its conventions. **Read-only — report, don't edit.** Ground every point in `git diff` and `AGENTS.md`.

## Enforce

1. **Async throughout.** No blocking calls on the event loop; SQLite/blocking I/O go through `asyncio.to_thread`. Flag sync DB calls in async paths.
2. **Trace-emitter pattern.** Stages use `async with emitter.stage(Stage.X, label) as rec:` (auto START/END + timing; set `rec.data`/`rec.metrics`); `emitter.emit(...)` for one-shot/PROGRESS. Flag hand-rolled START/END or a missing END.
3. **DI, not globals.** Graph nodes get `emitter`/`provider`/`registry` from `config["configurable"]` via `_deps()` (`agent/graph.py`) — never module globals. Flag global access.
4. **Everything is real (§2/§3).** No mock/offline branch. OpenAI-bound runs fail fast via `MissingAPIKeyError` when keyless — no silent fake fallback. An optional external key (e.g. Tavily) returns an honest error string. Ollama is the real opt-in second provider.
5. **MCP dual registration.** A tool change updates BOTH `@mcp.tool()` in `mcp/server.py` AND the `_load_local()` mirror in `mcp/client.py`. Flag drift.
6. **Schema sync.** A `_SCHEMA` change (in `db/store.py`) updates `docs/data-model.md`, `EXPECTED_TABLES` (test_schema_audit), integrity tests, and — if it holds clearable user data — `clear_all` + `EXPECTED_CLEAR_KEYS`; schema/constraint changes need a `PRAGMA user_version` migration. Flag any omission.
7. **Protocol (§1).** A `schemas.py` Stage/Phase/TraceEvent change must mirror in `frontend/src/types/events.ts` same commit (defer the deep audit to `/review-protocol`; flag an obviously missing mirror).
8. **Lint/style.** `ruff` line-length 100 (E501 ignored). Run `ruff check .` from `backend/` and report.
9. **TDD + structural tests (§9).** A behavior change is driven by a test that fails first; `[openai]` tests assert structurally (stage fired, tool used, answer non-empty) — flag brittle exact-string assertions on model output. Run `pytest -q` if a key is available and report.

**Output:** per-area ✅/❌ with `file:line` and the concrete fix. Separate **must-fix** (breaks a convention/gate) from **nits**. State whether `/verify-gates` would pass. End with a verdict. Do not modify files.
