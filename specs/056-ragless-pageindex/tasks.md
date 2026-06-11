# Tasks: RAGLESS retrieval (PageIndex)

> TDD checklist. Each implement task is preceded by the failing test that drives it.
> Build order: protocol + backend path first (server is the contract), then frontend.

## Backend

- [x] **T1 — test (no key)**: `test_pageindex_tree.py` — `build_tree()` returns a hierarchical
      tree from corpus markdown headings (file → paragraph sections). **green**
- [x] **T2 — impl**: `backend/app/rag/pageindex.py` `build_tree()` + `TreeNode` + `flatten`/
      `outline`; cached (`lru_cache`).
- [x] **T3 — protocol**: added `PAGEINDEX_TREE/NAVIGATE/SELECT` to `schemas.py` `Stage`;
      `ChatRequest.ragless: bool = False`; mirrored literals in `events.ts`.
- [x] **T4 — test `[openai]`**: `test_pageindex.py` — emits `pageindex.tree/navigate/select`,
      non-empty context + selected chunk(s), reasoning present, **no embedding**. **green**
- [x] **T5 — impl**: `pageindex.py` `_navigate()` (LLM call) + `pageindex_retrieve()`.
- [x] **T6 — test**: `test_ragless.py` — AC1 (off → none), AC2 (simple → none), AC4
      (`[openai]` intermediate → both `rag.*`+`pageindex.*`, ToolMessage == PageIndex). **green**
- [x] **T7 — impl**: `AgentState.ragless`; `_run_retrieval_tool` branch; `run_agent(_state)`
      param; `main.py` threads `req.ragless` + echoes when true + `GET /api/config`
      `ragless_default`; lifespan warms `build_tree()`.

## Frontend

- [x] **T8 — test**: `phases.test.ts` (existing parity test) — 3 new stages → `"retrieve"`. **green**
- [x] **T9 — test**: `ragless-visibility.test.ts` — `pageindex` station (data tier, stages,
      `STAGE_TO_STATION` parity, real/not-comingSoon), `showRagless` hides/shows it + the hop,
      Simple never shows it. **green** (glossary tag pinned by existing `strings.test.ts`.)
- [x] **T10 — impl**: `stations.ts` (`pageindex` station + hop + `showRagless` param), `layout.ts`
      geometry (data column below `rag`), `phases.ts` mapping.
- [x] **T11 — test**: `pageindexPipeline.test.ts` — `derivePageIndexPipeline` stage statuses. **green**
- [x] **T12 — impl**: `pageindexPipeline.ts` + `PageIndexPipelinePanel.tsx` (panel + inline
      stage details); `App.tsx` `HAS_DETAIL`/render; FlowCanvas `readoutFor` + node button;
      InspectorPanel `renderDetail` case + StationNode `innerRows`.
- [x] **T13 — test**: `experiment.test.ts` — `overridesFor` sends `ragless:true` only when on
      AND away from simple; off/simple omit it. **green**
- [x] **T14 — impl**: `experiment.ts` (`ragless`/`setRagless`) + `SettingsExperiment` toggle
      (Intermediate-only enabled, bilingual help).
- [x] **T15 — i18n**: all new strings en+pt (`strings.ts` readout/inspector/glossary/node/
      settings.experiment.ragless/pageindexDetail; station prose in `stations.ts`).
- [x] **T16 — refactor + gates green**: tsc ✓ · vitest 485 ✓ · build ✓ · ruff check+format ✓ ·
      pytest feature + core regression (agent/scenario/rerank/api/config/schema) ✓.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; keyless tree/guard tests still run)
- [ ] `npm run build` (`tsc --noEmit` + build) + `npm test` green
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); every `Stage` mapped to a station
      **and** a phase
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
