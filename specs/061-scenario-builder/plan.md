# Plan: 061-scenario-builder

> HOW we build the spec. Each acceptance criterion maps to a test (TDD). The work
> is phased so each phase ends on green gates; Phase A (backend) is a self-contained
> foundation, Phase B (frontend model + UI) consumes it.

## Approach

Replace the two global radio stores — `lib/scenario.ts` (008) and `lib/track.ts`
(059) — with **one selection store** of enabled component ids (`lib/selection.ts`,
global, localStorage). The canvas renders from that set; the maturity rung becomes a
**derived** label via `classify(selection)`. On the backend, the coarse `scenario`
enum is **removed** from the request and the three behaviours it gated become explicit
per-feature inputs (`rerank`, `runtime`, existing `ragless`).

**Component model.** A `ComponentId` is a selectable unit. Most map 1:1 to a
`StationId`; the agent **runtime** is a radio (`react|deepagents|multiagent`) that maps
to the single `agent` station's label + the sub-agent preview nodes. The fixed
**skeleton** (`frontend, backend, agent, llm, database`) is always on. `rag` + `mcp` are
optional, default-on. Each component carries a **maturity floor** read from its station
`scenarios[]` (lowest rung). `classify` = max floor over the selection. Dependencies:
`rerank`/`hybrid` require `rag`.

## Affected files

### Phase A — backend protocol decoupling (foundation)
- `backend/app/schemas.py` — remove `scenario` from `ChatRequest`; add `rerank: bool =
  False` and `runtime: Runtime` enum (`react|deepagents|multiagent`, default `react`);
  keep `ragless`. Drop the `Scenario` enum if it has no remaining backend use.
- `backend/app/agent/state.py` — `AgentState`: drop `scenario`, add `rerank` + `runtime`
  (keep `ragless`).
- `backend/app/agent/graph.py` — `_should_deepagents` → `runtime == "deepagents" and not
  ragless`; RAGLESS gate (`graph.py:443`) → drop the `and scenario == "intermediate"`;
  `run_agent(...)` signature swaps `scenario` for `rerank`/`runtime`.
- `backend/app/rag/retriever.py` — `rerank_on = rerank` (param) instead of `scenario ==
  "intermediate"`.
- `backend/app/agent/deepagents.py`, `backend/app/agent/prompts.py` — drop scenario refs.
- `backend/app/main.py` — stop reading `scenario`; thread `rerank`/`runtime` into state.
- Tests: rewrite `test_scenario.py` (→ `test_builder_inputs.py`), `test_rag_rerank.py`,
  `test_ragless.py`, `test_deepagents.py`, `test_failure.py`, `test_config_042.py` to use
  the new inputs (assert structurally, real-OpenAI per §9).

### Phase B — frontend selection model + UI
- **New** `frontend/src/lib/selection.ts` — `ComponentId`, `useSelection` (Zustand +
  localStorage), default = simple set; `classify`, `toggle`, dependency rules,
  `requestInputsFor(selection)` → `{rerank, runtime, ragless, …}`.
- `frontend/src/lib/stations.ts` — `visibleStationsFor` / `visibleHopsFor` /
  `visibleTiersFor` / `visibleStationIdsFor` take a `selection` set (not scenario+track);
  `relabelAgentForScenario` → `relabelAgentForRuntime(runtime)`; keep a `Maturity`
  type + `classify` for the badge. Retire `tracksForScenario` (or repurpose to palette
  groups). Keep `comingSoon` honesty (preview nodes still `stages: []`).
- `frontend/src/lib/layout.ts` — `computeLayout(expanded, selection, …)`.
- **New** `frontend/src/components/ScenarioBuilder.tsx` — header popover palette (two
  zones, grouped by category, runtime radio, dependency-disabled toggles, derived badge).
- **Remove** `ScenarioToggle.tsx` + `TrackToggle.tsx`; update `App.tsx` header.
- `frontend/src/lib/experiment.ts` + `lib/chatApi.ts` — derive + send `rerank`/`runtime`/
  `ragless`; drop `scenario`.
- Consumers: `FlowCanvas.tsx`, `InspectorPanel.tsx`, `RagPipelinePanel.tsx`,
  `PageIndexPipelinePanel.tsx`, `TourCaption.tsx`, `lib/onboarding.ts`, `lib/tourTrace.ts`,
  `lib/ragPipeline.ts`, `learn/content.ts`, `demo/fixtures.ts` + `lib/demo.ts`.
- `frontend/src/i18n/strings.ts` — new bilingual prose (palette, zone headers, dependency
  hints, badge, glossary for "maturity").
- Tests: rewrite `scenario.test.ts`/`track.test.ts` → `selection.test.ts`; update
  `layout.test.ts`, `stations.test.ts`, `phases.test.ts`, `ragless-visibility.test.ts`,
  and the component tests that set a scenario/track.

## Test strategy (AC → test)

- **AC1** (default == Simple) — `selection.test.ts`: default selection ids === today's
  simple set; `classify(default) === "simple"`; `requestInputsFor(default)` = `{rerank:
  false, runtime: "react", ragless: false}`. Backend: `test_builder_inputs.py` default run.
- **AC2** (independent toggle) — `selection.test.ts`: toggle reranker → set diff is
  exactly `{rerank-on}`.
- **AC3** (derived maturity) — `selection.test.ts`: `classify` table over sample
  selections.
- **AC4** (runtime radio) — `selection.test.ts`: selecting a runtime deselects others;
  `multiagent` reveals sub-agent ids.
- **AC5** (dependencies) — `selection.test.ts`: reranker/hybrid disabled without `rag`;
  removing `rag` clears them.
- **AC6** (preview honesty) — `phases.test.ts`/`stations.test.ts`: `STAGE_TO_STATION` &
  `STAGE_TO_PHASE` stay total; selecting a preview adds no stage; `canSend` true.
- **AC7** (real toggles drive backend) — pytest: `rerank=true` ⇒ `rag.rerank` fires;
  `runtime=deepagents` ⇒ DeepAgents preamble fires; neither ⇒ neither.
- **AC8** (layout reflow) — `layout.test.ts`: positions over a selection set; tier boxes
  wrap; empty tiers omitted.
- **AC9** (bilingual + cloud) — `stations.test.ts`/i18n test: en+pt present for new prose.

## Protocol / i18n / cloud impact

- **Protocol:** `ChatRequest` loses `scenario`, gains `rerank` + `runtime`. **No new
  executing `Stage`** — totality of `STAGE_TO_STATION`/`STAGE_TO_PHASE` preserved. Mirror
  `schemas.py` ⇄ client request type.
- **i18n:** all new palette/zone/badge prose en + pt (§4).
- **Cloud:** no new tier/station expected (preview nodes already exist); if any added,
  fill `clouds.{azure,aws,gcp}` (§5).

## Risks / sequencing

- **Clean-break coupling.** Removing `scenario` from the request is breaking; between
  Phase A and Phase B the app defaults to react/no-rerank (Pydantic ignores the stale
  `scenario` field the FE still sends). Acceptable in the working tree; land both phases
  before any commit so `main` is never half-migrated.
- **Demo mode (058).** Captured fixtures encode scenarios; verify `demo/fixtures.ts` +
  `lib/demo.ts` still resolve under the selection model (map captured runs to a selection).
- **Big test surface.** ~18 FE + 6 BE test files reference scenario/track; rewrite per
  phase, keep `npm test` / `pytest -q` green at each checkpoint.
