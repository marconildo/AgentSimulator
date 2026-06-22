---
name: add-mcp-tool
description: Add or change an MCP tool the agent can call. Use for any new agent-callable tool. The critical gotcha is dual registration — the tool must be registered as a FastMCP @mcp.tool AND mirrored in the in-process local fallback, or the stdio and fallback transports diverge. Covers the "everything is real" honesty rule.
---

MCP tools live in `backend/app/mcp/`. The agent reaches them through `ToolRegistry` (`client.py`), which prefers the real FastMCP server over stdio (`langchain-mcp-adapters`) but **falls back to calling the tool functions in-process** when the transport is unavailable. The agent and UI must behave identically either way (`transport` is `mcp-stdio` vs `local-fallback`).

A new agent-callable tool is a **feature → spec first** (run `new-spec`), then TDD.

## The dual-registration gotcha (the #1 way to break this)

The tool logic lives in a plain `_`-prefixed function in `server.py` precisely so both paths reuse it. When you add or change a tool you MUST update **both**:

1. The `@mcp.tool()` registration in `backend/app/mcp/server.py` (the stdio server).
2. The `_load_local()` mirror in `backend/app/mcp/client.py` (the in-process fallback).

If these drift, the tool works under one transport and silently fails under the other. Keep the signature, name, and docstring identical.

## Native vs MCP tools

- The four MCP tools (`calculator`, `current_time`, `kb_lookup`, `load_skill`, plus `web_search` from spec 052) speak over stdio / local fallback as above.
- `search_knowledge_base` (`agent/tools.py`) is a **native** agent tool wrapping the RAG retriever — not in the MCP server. It is what makes retrieval an honest agent decision (026). Different mechanism; don't add MCP tools there.

## Honesty rule (constitution §3 — everything is real)

The tool must **actually execute** — no faking. If it needs a key that may be absent (e.g. `TAVILY_API_KEY`, which is distinct from the required `OPENAI_API_KEY`), import the SDK lazily and return an **honest error string** when the key is missing, rather than fabricating a result. Add a pytest marker for tests that need that external service (e.g. `@pytest.mark.tavily`) so they skip cleanly.

## Frontend touch-points (no new Stage)

A tool rides the existing `mcp.discover` / `mcp.call` stages — **no new `Stage`**. But:

- Add a bilingual label in `frontend/src/i18n/strings.ts` (`toolLabels.<name>` with `en` + `pt`).
- List it in the tools vocabulary in `stations.ts` if the MCP station enumerates tools.

## Finish

Backend tests assert structurally (tool used, result shape). Then run the `verify-gates` skill. Reference: `CLAUDE.md` "MCP" section.
