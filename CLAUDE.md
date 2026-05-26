# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An educational visualizer of an agentic AI request lifecycle. The user types a message; the backend runs a real LangGraph agent (RAG → MCP tools → LLM) and emits every stage as a stream of trace events; the frontend animates those events across a graph of "stations" and lets you inspect the real data at each one. It runs fully offline in **demo mode** (deterministic mock LLM + mock embeddings, no API key).

## Commands

```bash
# Full stack (demo mode, no keys)
docker compose up --build          # frontend :5173, backend :8000/docs

# Backend (from backend/)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.rag.ingest           # build/rebuild the Chroma index (idempotent)
uvicorn app.main:app --reload --port 8000
ruff check .                       # lint (CI gate)
ruff format .
pytest -q                          # all tests; force offline with DEMO_MODE=true
pytest tests/test_agent.py -q                              # one file
pytest tests/test_agent.py::test_math_question_invokes_calculator_tool   # one test
python -m app.mcp.server           # run the MCP server standalone (stdio)

# Frontend (from frontend/)
npm install
npm run dev                        # :5173
npm run build                      # tsc --noEmit + vite build (CI gate)
```

CI (`.github/workflows/ci.yml`) runs `ruff check` + `pytest` (Python 3.12) and `npm run build` (Node 20). There is no frontend test/lint step beyond the type-check in `build`.

## Architecture — the load-bearing ideas

**The event protocol is the contract.** `backend/app/schemas.py` defines `Stage`, `Phase`, and `TraceEvent`; `frontend/src/types/events.ts` is a hand-maintained TypeScript mirror. **When you change one, change the other.** Every stage of the pipeline emits `TraceEvent`s that are both streamed to the browser over SSE *and* kept in a per-trace list for replay.

**Trace emission** (`backend/app/trace.py`). A `TraceEmitter` is threaded through every stage. Use `async with emitter.stage(Stage.X, label) as rec:` — it emits a `START` on enter, auto-times the body, and emits an `END` (with `rec.data` / `rec.metrics`) on exit. Use `emitter.emit(...)` directly for one-shot or `PROGRESS` events (e.g. per-token streaming). Finished traces live in a process-wide, bounded in-memory `TraceStore` — **the app is single-instance by design** (no shared state across replicas).

**The agent** (`backend/app/agent/graph.py`) is a bounded ReAct loop:
`START → route → retrieve → think ⇄ tools → generate → respond → END`. `think` decides (via the provider) whether to call tools; `_should_continue` loops back to `tools` while there are pending calls and `iterations <= MAX_ITERATIONS (3)`. Nodes get their dependencies (`emitter`, `provider`, `registry`) from `config["configurable"]`, **not** from globals — see `_deps()`. State is the `AgentState` TypedDict in `state.py`. The compiled graph is `lru_cache`d.

**Demo vs OpenAI mode** is the central swap and is governed by `config.py`'s `Settings.is_demo`: explicit `DEMO_MODE` wins, otherwise it auto-detects from the presence of `OPENAI_API_KEY`. The swap happens behind the `LLMProvider` ABC (`llm/provider.py`, Strategy pattern): `get_provider()` returns `MockProvider` or `OpenAIProvider`. Embeddings swap the same way (`rag/embeddings.py`). **Only model reasoning/generation and embeddings are mocked — the LangGraph loop, the Chroma vector store, the SQLite app database, and MCP tool *execution* are always real.**

**MCP** (`backend/app/mcp/`). `server.py` is a real FastMCP server (`calculator`, `current_time`, `kb_lookup`) speaking over stdio. `client.py`'s `ToolRegistry` prefers loading those tools via `langchain-mcp-adapters` over stdio, but **falls back to calling the tool functions in-process** if the transport is unavailable — the agent and UI behave identically (`transport` is `mcp-stdio` vs `local-fallback`). The tool logic lives in plain `_`-prefixed functions in `server.py` precisely so the fallback can reuse it; **if you add/change a tool, update both the `@mcp.tool()` registration and the `_load_local()` mirror in `client.py`.**

**RAG** (`backend/app/rag/`). `ingest.py` chunks the `data/corpus/*.md` files and builds a persistent Chroma collection (`ai_engineering`, cosine space). `retriever.py` embeds the query, does a top-k similarity search, and converts Chroma distance to a 0..1 score via `similarity = 1 - distance`. The index is auto-built on app startup if missing (`main.py` lifespan) and rebuilt fresh in `tests/conftest.py`. Rebuilds use Chroma's `reset_collection()` rather than deleting files (the dir is a mounted Docker volume).

**Two databases, on purpose.** Besides the RAG *vector* store, there is a *relational* application database (`backend/app/db/store.py`, `ConversationStore`) — a real SQLite store (managed SQL in production), the transactional system of record. `main.py` emits `db.read` (load recent history) before the agent runs and `db.write` (persist the conversation) after, both inside the `BACKEND` stage. SQLite calls run via `asyncio.to_thread` so they don't block the event loop. The DB path is `app_db_path` in `config.py` (env `APP_DB_PATH`); `conftest.py` points it at a throwaway temp file. Keep the two stores distinct — embeddings vs transactional state are different jobs.

**Frontend rendering is a pure projection.** `frontend/src/lib/derive.ts`'s `deriveView(events, cursor)` turns the event log up to a cursor into everything the canvas draws (station statuses, the active hop and its direction, streamed answer, iteration count). **Live streaming and step/replay are the exact same code path — replay is just a smaller cursor.** The Zustand store (`store/useSimulator.ts`) holds the event list + cursor and drives both. `lib/sse.ts` is a custom fetch-based SSE client (the native `EventSource` only does GET; we need POST).

**`frontend/src/lib/stations.ts` is the single source of truth for the visual model** — tiers (deployable containers, each with a friendly `title` + canonical n-tier `alias`), stations (moving parts), network hops (protocol + `zone` public/private + security `controls`), and the private-network `BOUNDARY_SRC` (VNet/VPC) drawn behind the tiers. It also derives `STAGE_TO_STATION`, which `deriveView` relies on: **every `Stage` must be listed in exactly one station's `stages` array**, or events for an unmapped stage will break the projection. Adding a pipeline stage therefore means: new `Stage` in `schemas.py` + `events.ts`, emit it in the relevant node, assign it to a station in `stations.ts`, **and add a `case` for that station in both `readoutFor` (FlowCanvas) and `renderDetail` (InspectorPanel)** — these switches are exhaustive over `StationId`.

**Cloud overlay.** The model is cloud-agnostic: every tier/station/boundary carries a `generic` role (translatable, the thing that matters) plus a `clouds: { azure, aws, gcp }` map of concrete example services (proper nouns, **not** translated). The active provider lives in `frontend/src/lib/cloud.ts` (`useCloud`, mirrors the language store); `cloudValue(meta, cloud)` resolves the label — `"generic"` returns the role, otherwise the cloud-specific name. **Do not fork the app per cloud; add provider names to the `clouds` map.** When you add a tier/station, fill all three of `azure`/`aws`/`gcp`.

**i18n** (`frontend/src/i18n/`). Two languages (`en`/`pt`). Translatable prose in `stations.ts` and `learn/content.ts` uses `{ en, pt }` objects resolved by `*For(lang)` builders (results cached per language). Code, protocols, and proper nouns stay plain strings.

> **Rule: every new piece of user-facing text must ship in both English and Portuguese.** Whenever you add a station, hop, Learn topic, label, blurb, error message, or any prose the user can read, provide both `en` and `pt` — never add an English-only (or Portuguese-only) string. Use the `{ en, pt }` shape (or `strings.ts` for UI chrome). A new feature is not done until its `pt` text exists alongside its `en` text.

## Conventions

- Backend is async throughout; `ruff` with `line-length=100` (E501 ignored), `pytest` in `asyncio_mode=auto`. Tests must run fully offline — keep `DEMO_MODE=true` paths deterministic.
- Frontend uses React 18 + Vite + TS + `@xyflow/react` (React Flow) + Framer Motion + Tailwind v4 (via `@tailwindcss/vite`). `npm run build` type-checks with `tsc --noEmit`, so keep types clean.
- Config is read from `backend/.env` (see `.env.example`); `VITE_API_BASE` (build-time) points the frontend at the backend (empty = same origin, set in `docker-compose.yml`).
- **Bilingual by default:** any new user-facing text must be added in both English and Portuguese (`{ en, pt }`) — see the i18n rule above.

## Docs

`docs/architecture.md` and `docs/how-it-works.md` are the long-form walkthroughs (kept in sync with the code above).
