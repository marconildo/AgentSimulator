# Spec: Web search tool (Tavily)

| | |
|---|---|
| **ID** | 052-web-search-tool |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-03 |

## Problem / motivation

The agent's knowledge is bounded by the RAG corpus (`search_knowledge_base`) and
a tiny glossary (`kb_lookup`). It has **no way to reach the live internet**, so any
question about recent events, prices, docs, or anything outside the corpus forces it
to either abstain or hallucinate. A real production agent almost always has a web
search tool; the simulator's story is incomplete without one. Adding it as a first-class
MCP tool keeps the "everything is real" promise (a real Tavily call, real sources) and
makes the ReAct loop visibly richer — the model now elects between *internal* knowledge
(RAG/glossary) and *external* knowledge (the web).

## Goals

- The agent can call a `web_search` tool that performs a **real** internet search via
  Tavily and returns a synthesized answer plus its top sources (title + URL + snippet).
- It is a normal MCP tool: discovered through `mcp.discover`, executed through `mcp.call`,
  toggleable in the experiment panel, and visible in every existing trace UI — **no new
  pipeline stage**.
- It degrades honestly: with no `TAVILY_API_KEY` configured the tool returns a clear
  `error:` string the model can read, and never crashes the agent or the app.
- The new tool name is labelled in the UI in both English and Portuguese.

## Non-goals

- No new `Stage`, station, hop, tier, or event-protocol change.
- No automatic ingestion of search results into the vector store (the result is returned
  to the model in-context only).
- No UI for configuring the Tavily key or search depth — the key lives in `.env`; depth
  is a fixed default.
- The app remains OpenAI-only: Tavily is an **optional** integration. A missing Tavily key
  does **not** stop startup (unlike the required `OPENAI_API_KEY`).

## User-facing behavior

- When the user asks something requiring current/external information, the agent may elect
  to call `web_search`; the canvas shows the usual `mcp.call` hop to the tool, and the
  Inspector shows the query (args) and the returned answer + sources (result).
- In **Settings → Experiment**, `web_search` appears in the tool-toggle list with a
  friendly label: **"Web search"** (en) / **"Busca na web"** (pt).
- With no `TAVILY_API_KEY`, if the agent calls the tool the result is a readable error
  string (e.g. *"error: web search is unavailable — TAVILY_API_KEY is not configured"*),
  surfaced like any other tool result.

## Acceptance criteria

1. **AC1** — The tool registry advertises a tool named `web_search` (in `registry.names()`
   and `registry.specs()`), on both the `mcp-stdio` and `local-fallback` transports.
2. **AC2** — `web_search` accepts a single string `query` argument (its schema declares
   `query: string`, required).
3. **AC3** (keyless guard, runs without any key) — With `TAVILY_API_KEY` unset, calling
   `web_search` returns a non-empty string starting with `error` and **does not raise**.
4. **AC4** (`@pytest.mark.tavily`, skipped without a key) — With a real `TAVILY_API_KEY`,
   `web_search("...")` returns a non-empty result that contains at least one source URL
   (structural assertion, tolerant of result variability).
5. **AC5** — The tool honors the experiment toggle: `registry.specs(["web_search"])` keeps
   only `web_search`, and `registry.call("web_search", …, enabled=["calculator"])` is
   refused with an `error` string (defense-in-depth parity with the other tools).
6. **AC6** — `web_search` is labelled in `toolLabels` for both `en` and `pt`; the frontend
   build (`tsc --noEmit`) and the i18n key-parity test stay green.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — `web_search` rides the existing `mcp.discover` /
  `mcp.call` stages, exactly like `calculator` / `kb_lookup` / `load_skill`.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no protocol change).
- Station it maps to in `stations.ts`: **mcp** (the existing MCP tool service station);
  the tool name is added to that station's `tech` "tools" listing.

## Open questions (clarify before planning)

- [x] SDK vs raw HTTP → **`tavily-python` SDK** (user choice).
- [x] Result shape → **synthesized answer + top sources** (title/URL/snippet) (user choice).
- [x] Env var name → `TAVILY_API_KEY`.
- [x] Required at startup? → **No.** Optional integration; missing key ⇒ honest error at
      call time, not a fail-fast (only `OPENAI_API_KEY` is required, constitution §2).

## Out of scope / deferred

- Caching of search results; configurable `search_depth` / `max_results` via the UI.
- Ingesting fetched pages into RAG (a future "research → index" flow could be its own spec).
