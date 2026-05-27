# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An educational visualizer of an agentic AI request lifecycle. The user types a message; the backend runs a real LangGraph agent (RAG → MCP tools → LLM) and emits every stage as a stream of trace events; the frontend animates those events across a graph of "stations" and lets you inspect the real data at each one. It runs **only against OpenAI** — an `OPENAI_API_KEY` is required (there is no offline/demo mode); with no key it fails fast at startup. Reasoning, embeddings, the vector store, the relational DB and MCP are all real.

## How we build here — SDD + TDD (non-negotiable)

This project is **spec-first (Spec-Driven Development)** and **test-first (Test-Driven Development)**, and that applies to **every task — even when the user does not ask for it.** The intent is written and reviewed *before* the code; acceptance criteria become failing tests. Two documents govern this, and the constitution wins on any conflict:

- **`.specify/constitution.md`** — the 10 non-negotiable principles (protocol-is-the-contract, single provider (OpenAI) required, everything is real, bilingual en/pt, cloud-agnostic, one source of truth for the visual model, pure projection, single-instance, **§9 TDD**, **§10 SDD**) + the quality gates + the amendment process.
- **`specs/README.md`** — the workflow: `specify → clarify → plan → tasks → implement (TDD) → verify`. `specs/000-core-pipeline/` is a worked example (every acceptance criterion points at a passing test); `specs/_template/` is what you copy to start.

### New feature → write a spec first (stop and do this)
When the user asks for a new feature or a behavior change, **do not jump to code.** Create the spec, and **if the user skipped it, remind them** before writing any code:

1. Copy `specs/_template/` to `specs/NNN-feature-name/` (zero-padded, sequential — `001-`, `002-`, …).
2. Fill `spec.md` — WHAT + WHY + numbered, **testable** acceptance criteria. No implementation detail. Resolve every open question ("clarify") before planning.
3. Fill `plan.md` — HOW: approach, affected files, protocol/i18n/cloud impact, and a test strategy that maps each acceptance criterion to a test.
4. Fill `tasks.md` — ordered TDD checklist; each implement task is preceded by the failing test that should drive it.
5. Implement **red → green → refactor**, checking boxes, and move the spec's status along (`draft → clarified → planned → in-progress → done`).

### TDD always
Acceptance criteria (for a feature) or a reproducing case (for a bug) become a **failing test first**; then code makes it pass; then refactor. Tests run against **real OpenAI** (CI provides the key as a secret) and assert **structurally** (stages fired, tool used, answer non-empty, relevant doc ranks first) to tolerate model variability. Keyless guard tests (e.g. fail-fast-without-a-key) still run without a key; `[openai]` tests are skipped when none is configured.

### Does this change need a spec?
Specs are for **features and behavior changes**, not every edit. TDD, by contrast, applies to anything that changes behavior.

| Change | Spec? | TDD? |
|---|---|---|
| New feature, new user-facing behavior, **new `Stage`/`Phase`**, new station/hop/tier, any event-protocol change | **Yes** — full `spec → plan → tasks` | Yes |
| Bug fix · small adjustment · behavior-preserving refactor | **No** | **Yes** — write a failing regression test first, then fix |
| Docs · comments · formatting · dependency bumps · pure chores | No | n/a |

**Gray-zone rule:** if a change touches the event protocol (§1), adds/removes a `Stage`, or adds a station/hop/tier, treat it as a **feature → spec required**, however small it looks. When unsure, write the spec.

### Done means the gates are green
Mirror of `ci.yml` + the constitution: `ruff check .` · `ruff format .` · `pytest -q` (with `OPENAI_API_KEY`) · `npm run build` (`tsc --noEmit` + build) · `npm test` (Vitest) — **plus** the protocol mirror in sync (§1), every `Stage` mapped to a station (§6), all new user-facing text in **en + pt** (§4), and the cloud map filled for any new tier/station (§5).

## Commands

```bash
# Full stack (requires OPENAI_API_KEY in backend/.env)
docker compose up --build          # frontend :5173, backend :8000/docs

# Backend (from backend/)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.rag.ingest           # build/rebuild the Chroma index (idempotent)
uvicorn app.main:app --reload --port 8000
ruff check .                       # lint (CI gate)
ruff format .
pytest -q                          # all tests (needs OPENAI_API_KEY; keyless guard tests still run)
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

**Experiment overrides (006-interactive-experiments) are request-only inputs, not new stages.** `ChatRequest` carries optional `system_prompt` (full replace; blank ⇒ default `SYSTEM_PROMPT`; capped 2000), `enabled_tools` (`None`=all, `[]`=none, list=only those — filtered per-request via `ToolRegistry.specs(enabled)` so `mcp.discover` honestly lists only enabled tools, the cached registry is never mutated), and `top_k` (bounded 1..8). They thread through `run_agent` → `AgentState` → the nodes; the provider already takes `system=`, so AC1 needed no provider change. Omitting all three reproduces today's behavior exactly. `GET /api/config` exposes the default prompt, tool list and top-k bounds so the frontend prefills without hardcoding; the ⚙️ `SettingsPanel` hosts the controls, scoped **per conversation** in the in-memory `useExperiment` store (`frontend/src/lib/experiment.ts`).

**The maturity ladder (008-scenario-framework) is a request-only `Scenario`, not new stages.** A **global** app mode (`simple` | `intermediate` | `advanced`, mirrors `useCloud`, persisted to localStorage in `frontend/src/lib/scenario.ts`) that picks *how much* of a production pipeline the diagram shows; `simple` is byte-for-byte today. `stations.ts` is scenario-aware (each tier/station/hop carries a `scenarios[]` membership; `visibleStationsFor`/`visibleHopsFor`/`visibleTiersFor` and `computeLayout(expanded, scenario)` render only the active rung's set). The upper rungs declare their extra nodes as **non-executing `comingSoon` previews** (`stages: []`, so `STAGE_TO_STATION`/`STAGE_TO_PHASE` stay total) — **§3 everything-is-real is about *execution***, and a clearly-labelled non-running node honours it; `canSend(scenario)` gates the send button so nothing fakes a run. Each later spec (009+) lights up one rung's real nodes. The roadmap framing: **Intermediate** = RAG-quality + honest cost (reranker, hybrid search, token/cost), **Advanced** = how agents live in production (LLM gateway, guardrails, semantic cache, eval runner, observability).

**Upper-rung agent reframing (frontend label only — NOT implemented).** The **agent node is relabelled per scenario** as a *visual reminder* of where the ladder heads: Simple keeps `Agent`/`ReAct`; **Intermediate → `DeepAgents`** (planner + sub-agents + virtual file system); **Advanced → `DeepAgents + Multi-agents`** (orchestrator coordinating specialized sub-agents, `pt`: `DeepAgentes + Multiagentes`). This is `AGENT_SCENARIO_LABEL` + `relabelAgentForScenario` in `stations.ts` (applied inside `visibleStationsFor`), overriding only the agent node's `title`/`tag` — **same `agent` id, stages and identity; no backend, no new `Stage`, canvas-only** (the Inspector/AgentDetail still read the unscoped `stationByIdFor`). Bilingual glossary tooltips for `DeepAgents` / `Multi-agent` live in `i18n/strings.ts`, both flagged *"Planned — not yet implemented."* When a future spec actually builds a DeepAgents / multi-agent runtime, wire it for real (its own spec) instead of extending this label marker.

**OpenAI is required — there is no demo/mock mode.** The `LLMProvider` ABC (`llm/provider.py`, Strategy pattern) stays as a thin seam, but `get_provider()` always returns `OpenAIProvider`; with no `OPENAI_API_KEY` it raises `MissingAPIKeyError` (defined in `config.py`) rather than falling back. `get_embeddings()` (`rag/embeddings.py`) does the same. **Everything is real** — reasoning, embeddings, the LangGraph loop, the Chroma vector store, the SQLite app database, and MCP tool *execution*. `/api/health` reads the model straight from settings (and reports `has_key`) so it stays inspectable even without a key.

**MCP** (`backend/app/mcp/`). `server.py` is a real FastMCP server (`calculator`, `current_time`, `kb_lookup`) speaking over stdio. `client.py`'s `ToolRegistry` prefers loading those tools via `langchain-mcp-adapters` over stdio, but **falls back to calling the tool functions in-process** if the transport is unavailable — the agent and UI behave identically (`transport` is `mcp-stdio` vs `local-fallback`). The tool logic lives in plain `_`-prefixed functions in `server.py` precisely so the fallback can reuse it; **if you add/change a tool, update both the `@mcp.tool()` registration and the `_load_local()` mirror in `client.py`.**

**RAG** (`backend/app/rag/`). `ingest.py` chunks the `data/corpus/*.md` files and builds a persistent Chroma collection (`ai_engineering`, cosine space). `retriever.py` embeds the query, does a top-k similarity search, and converts Chroma distance to a 0..1 score via `similarity = 1 - distance`. The index is auto-built on app startup if missing (`main.py` lifespan) and rebuilt fresh in `tests/conftest.py`. Rebuilds use Chroma's `reset_collection()` rather than deleting files (the dir is a mounted Docker volume).

**Two databases, on purpose.** Besides the RAG *vector* store, there is a *relational* application database (`backend/app/db/store.py`, `ConversationStore`) — a real SQLite store (managed SQL in production), the transactional system of record. `main.py` emits `db.read` (load recent history) before the agent runs and `db.write` (persist the conversation) after, both inside the `BACKEND` stage. SQLite calls run via `asyncio.to_thread` so they don't block the event loop. The DB path is `app_db_path` in `config.py` (env `APP_DB_PATH`); `conftest.py` points it at a throwaway temp file. Keep the two stores distinct — embeddings vs transactional state are different jobs.

**Long-term memory is real.** `db.read` returns recent `{message, answer}` pairs; `main.py` passes them as `history` into `run_agent` → `AgentState.history` → the provider's `decide`/`stream_answer` (`history` param on the `LLMProvider` ABC and both impls), which folds them into the prompt and into `prompt_preview`. So the agent genuinely sees prior turns — working memory (per-request state) and long-term memory (the DB) are distinct, and the Agent drill-in visualizes both.

**Frontend rendering is a pure projection.** `frontend/src/lib/derive.ts`'s `deriveView(events, cursor)` turns the event log up to a cursor into everything the canvas draws (station statuses, the active hop and its direction, streamed answer, iteration count). **Live streaming and step/replay are the exact same code path — replay is just a smaller cursor.** The Zustand store (`store/useSimulator.ts`) holds the event list + cursor and drives both. `lib/sse.ts` is a custom fetch-based SSE client (the native `EventSource` only does GET; we need POST).

**Geometry vs. content are separate.** `lib/layout.ts`'s `computeLayout(expanded)` owns all canvas geometry — three columns (client / middle = API-over-Agent / data), stacked top-down, with per-station collapsed vs expanded heights; expanding a station reflows the ones below it and recomputes the tier boxes + the private-network boundary. `stations.ts` owns identity/content only. `FlowCanvas` reads positions/boxes from the layout, not from `stations.ts`.

**Progressive disclosure (Transformer-Explainer style).** The canvas is simple by default; each `StationNode` has a ⊕ that toggles inline expansion (compact internals), tracked by `expanded: StationId[]` in the store. The **Agent** additionally has an "open full view" that sets `detail` and renders `AgentDetail` — a focused overlay (over `<main>`) showing the ReAct loop, working memory, long-term memory and context-window assembly, all **composed client-side from existing trace events** (no extra requests). `FlowEdge` shows a hover tooltip (protocol/detail/zone/controls) via a transparent wide hit-path.

**`frontend/src/lib/stations.ts` is the single source of truth for the visual model** — tiers (deployable containers, each with a friendly `title` + canonical n-tier `alias`), stations (moving parts), network hops (protocol + `zone` public/private + security `controls`), and the private-network `BOUNDARY_SRC` (VNet/VPC) drawn behind the tiers. It also derives `STAGE_TO_STATION`, which `deriveView` relies on: **every `Stage` must be listed in exactly one station's `stages` array**, or events for an unmapped stage will break the projection. Adding a pipeline stage therefore means: new `Stage` in `schemas.py` + `events.ts`, emit it in the relevant node, assign it to a station in `stations.ts`, **and add a `case` for that station in both `readoutFor` (FlowCanvas) and `renderDetail` (InspectorPanel)** — these switches are exhaustive over `StationId`. There is a **second exhaustive map over `Stage`**: `STAGE_TO_PHASE` in `frontend/src/lib/phases.ts` (the timeline phase rail, 004-timeline-phases) — a new `Stage` must be assigned a `TimelinePhase` there too, or `tsc` fails on the `Record<Stage, TimelinePhase>` (the `phases.test.ts` AC1 test also pins parity with `STAGE_TO_STATION`).

**Cloud overlay.** The model is cloud-agnostic: every tier/station/boundary carries a `generic` role (translatable, the thing that matters) plus a `clouds: { azure, aws, gcp }` map of concrete example services (proper nouns, **not** translated). The active provider lives in `frontend/src/lib/cloud.ts` (`useCloud`, mirrors the language store); `cloudValue(meta, cloud)` resolves the label — `"generic"` returns the role, otherwise the cloud-specific name. **Do not fork the app per cloud; add provider names to the `clouds` map.** When you add a tier/station, fill all three of `azure`/`aws`/`gcp`.

**i18n** (`frontend/src/i18n/`). Two languages (`en`/`pt`). Translatable prose in `stations.ts` and `learn/content.ts` uses `{ en, pt }` objects resolved by `*For(lang)` builders (results cached per language). Code, protocols, and proper nouns stay plain strings.

> **Rule: every new piece of user-facing text must ship in both English and Portuguese.** Whenever you add a station, hop, Learn topic, label, blurb, error message, or any prose the user can read, provide both `en` and `pt` — never add an English-only (or Portuguese-only) string. Use the `{ en, pt }` shape (or `strings.ts` for UI chrome). A new feature is not done until its `pt` text exists alongside its `en` text.

## Conventions

- **SDD + TDD are mandatory** (see "How we build here" above): a new feature gets a spec under `specs/` before code; a behavior change is driven by a failing test first. This holds even when the request doesn't mention it.
- Backend is async throughout; `ruff` with `line-length=100` (E501 ignored), `pytest` in `asyncio_mode=auto`. Tests run against real OpenAI (mark model/embedding-dependent tests `@pytest.mark.openai`; they're skipped without a key) and assert structurally to tolerate model variability.
- Frontend uses React 18 + Vite + TS + `@xyflow/react` (React Flow) + Framer Motion + Tailwind v4 (via `@tailwindcss/vite`). `npm run build` type-checks with `tsc --noEmit`, so keep types clean.
- Config is read from `backend/.env` (see `.env.example`); `VITE_API_BASE` (build-time) points the frontend at the backend (empty = same origin, set in `docker-compose.yml`).
- **Bilingual by default:** any new user-facing text must be added in both English and Portuguese (`{ en, pt }`) — see the i18n rule above.

## Docs

- `docs/architecture.md` and `docs/how-it-works.md` — long-form walkthroughs of the running system (kept in sync with the code above).
- `docs/development-workflow.md` — how to build here (SDD + TDD), the contributor-facing companion to `.specify/constitution.md` and `specs/README.md`.
