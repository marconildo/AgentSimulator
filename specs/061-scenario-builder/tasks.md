# Tasks: 061-scenario-builder

> Ordered TDD checklist (red → green → refactor). Phase A ends on green `pytest`;
> Phase B ends on green `npm test` + `npm run build`. Land both before any commit.

## Phase A — backend protocol decoupling ✅ (323 passed, ruff clean)

- [x] **A0.** Rewrote `tests/test_scenario.py` → `tests/test_builder_inputs.py`:
  `ChatRequest` has no `scenario`; has `rerank: bool=False` + `runtime` enum (default
  `react`); default run reranks nothing / uses ReAct; config keeps scenarios as metadata.
- [x] **A1.** `schemas.py`: dropped `scenario`; added `Runtime` enum + `rerank`/`runtime`;
  removed `Scenario` enum.
- [x] **A2.** `state.py`: `AgentState` swapped `scenario` → `rerank` + `runtime`.
- [x] **A3.** `tests/test_rag_rerank.py` drives `rerank=True`; `retriever.py`
  `rerank_on = rerank` (import aliased to `rerank_chunks` to avoid the param collision).
- [x] **A4.** `tests/test_deepagents.py` gates on `runtime=="deepagents"`; `graph.py`
  `_with_deepagents` + `prompts.deepagents_block(runtime)`.
- [x] **A5.** `tests/test_ragless.py`: RAGLESS fires on `ragless=True` regardless of rung;
  `graph.py` gate dropped the `and scenario=="intermediate"` clause.
- [x] **A6.** `graph.py` `run_agent`/`run_agent_state`, `main.py`, `deepagents.py`,
  `prompts.py`: thread `rerank`/`runtime`; scenario reads removed.
- [x] **A7.** `test_failure.py`/`test_config_042.py` — no breakage (config kept
  `scenarios` as derived-badge metadata).
- [x] **A8 (gate).** `ruff check .` · `ruff format .` · `pytest` → **323 passed**.

## Phase B — frontend selection model ✅

- [x] **B0/B1.** `lib/selection.ts` + `lib/selection.test.ts` (7 tests): `ComponentId`,
  `useSelection` (global localStorage), `classify`, `toggle` + dependency rules,
  `requestInputs`, `resolveStations`, `useResolvedSelection`/`useMaturity` hooks,
  `selectionOf`/`DEFAULT_SELECTION` helpers. Covers AC1–AC5.
- [x] **B2.** Rewired `stations.ts` (`visible*` take a `ResolvedSelection`; runtime
  relabel via `relabelAgentForRuntime`; dropped track/ragless/scenario gating) +
  `layout.ts` (`computeLayout(expanded, selection, showUpload)`). Updated `layout.test.ts`.
- [x] **B3.** Totality preserved — no new `Stage`; `phases.test.ts` unchanged & green.
- [x] **B4.** Deleted `scenario.test.ts`/`track.test.ts` + `lib/scenario.ts`; kept
  `lib/track.ts` (the `Track` type now names the palette categories).

## Phase B (cont.) — UI + wiring ✅

- [x] **B5.** `components/ScenarioBuilder.tsx` (header popover: runtime radio, category
  groups, dependency-disabled toggles, per-item preview pill, derived maturity badge).
  Removed `ScenarioToggle.tsx` + `TrackToggle.tsx`; updated `App.tsx`.
- [x] **B6.** `lib/experiment.ts` `overridesFor` + `ChatOverrides`: derive & send
  `rerank`/`runtime`/`ragless` from the selection; dropped `scenario`.
- [x] **B7.** Migrated consumers: `FlowCanvas`, `InspectorPanel`, `RagPipelinePanel`,
  `PageIndexPipelinePanel`, `TourCaption`, `ragPipeline.ts`, `learn/content.ts`,
  `lib/demo.ts` (readScenario derives maturity from the selection).
- [x] **B8.** `i18n/strings.ts`: bilingual `builder.*` (label/title/zones/groups/
  components/runtimes/maturityNames) — §4.
- [x] **B9.** Updated `stations.test.ts`, `ragless-visibility.test.ts`,
  `upload-visibility.test.ts`, `experiment.test.ts`, `ragPipeline.test.ts`,
  `layout.test.ts`; removed `SettingsExperiment` RAGLESS toggle + `ChatPanel` send-gate.
- [x] **B10 (gate).** `npm test` → **499 passed**; `npm run build` (tsc + vite) clean.

## Close-out

- [x] **C1.** Updated `learn/content.ts` prose; `docs/roadmap.md` + `CLAUDE.md` builder
  reframing; spec status → done.
- [x] **C2.** Gate sweep: backend **323 pytest** (Phase A) · frontend **499 vitest** +
  build, all green.
