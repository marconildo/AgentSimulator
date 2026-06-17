# Tasks: Retrieval strategy is a radio (Vector RAG ⊻ RAGLESS)

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives it.
> Order: FE model first (pure, keyless, fast), then the builder UI, then backend routing.

## Frontend — selection model (the radio)

- [x] **T1 — test first (AC1/AC2/AC3)**: in `selection.test.ts`, add failing tests:
      `setRetrieval("ragless")` makes strategy `ragless` and never leaves `vector` active;
      default strategy is `vector` with `rag` in stations and `ragless:false` in request inputs;
      `requestInputs` returns `{ragless:true, rerank:false}` for `ragless` and
      `{ragless:false, rerank:true}` for `vector`+rerank.
- [x] **T2 — implement**: add `RetrievalStrategy`, `retrieval`/`setRetrieval`, thread the
      strategy through `resolveStations`/`requestInputs`/`classify` and the selectors; remove
      `rag`/`ragless` from `ComponentId` & friends. Make T1 green.
- [x] **T3 — test first (AC4)**: in `selection.test.ts` + `ragless-visibility.test.ts`,
      `resolveStations` includes `pageindex`/excludes `rag` under `ragless` and the inverse
      under `vector`.
- [x] **T4 — implement**: station-set branching on strategy. Make T3 green.
- [x] **T5 — test first (AC5)**: `canToggle("rerank")`/`("hybrid")` are false under `ragless`;
      switching to `ragless` while `rerank` is enabled clears `rerank`.
- [x] **T6 — implement**: strategy-gate rerank/hybrid (`REQUIRES`→strategy; clear-on-switch in
      `setRetrieval`). Make T5 green.
- [x] **T7 — test first (migration)**: a persisted `{enabled:["rag","mcp","ragless"], …}` blob
      loads as `retrieval:"ragless"` with `rag`/`ragless` stripped from `enabled`.
- [x] **T8 — implement**: `loadSelection`/`persist` carry + migrate `retrieval`. Make T7 green.

## Frontend — builder UI + i18n

- [x] **T9 — i18n (constitution §4)**: add `builder.retrievalHeading` + `retrievalStrategies`
      (vector/ragless `{name,blurb}`) in **en + pt**; remove `components.rag`/`.ragless`.
- [x] **T10 — implement**: `ScenarioBuilder.tsx` renders the Retrieval-strategy radio atop the
      "Retrieval & Data" group; rerank/hybrid checkboxes dimmed + "requires Vector RAG" tooltip
      under RAGLESS. Manual: `npm run build` + Vitest green.

## Backend — RAGLESS replaces the vector path

- [x] **T11 — test first (AC6/AC7)**: rewrite `test_ragless.py::test_ragless_on_runs_both_paths_and_pageindex_grounds`
      → `test_ragless_on_skips_vector_path`: `ragless=True` ⇒ **no** `rag.*` stages and
      `pageindex.*` present + grounds; keep AC7 guards (`ragless=False` ⇒ no `pageindex.*`,
      `rag.*` present).
- [x] **T12 — implement**: in `graph.py` `_run_retrieval_tool`, branch so `ragless` runs only
      `pageindex_retrieve` (skip `rag_retrieve`). Make T11 green.
- [x] **T13 — test first (AC8)**: unit (keyless) for `_retrieved_chunks` — hand-built emitter
      with only `PAGEINDEX_SELECT` END events returns the PageIndex chunks; with a `RAG_RETRIEVE`
      END event present it returns the vector chunks (precedence unchanged).
- [x] **T14 — implement**: `main.py` `_retrieved_chunks` falls back to `PAGEINDEX_SELECT` END
      `chunks` when no `RAG_RETRIEVE` END exists. Make T13 green.

## Cross-cutting

- [x] **T15 — fix fallout**: update any other test/consumer referencing `rag`/`ragless` as a
      `ComponentId` (`stations.test.ts`, `experiment.test.ts`, demo). Keep all suites green.
- [x] **T16 — demo sanity (058)**: build demo mode and confirm a RAGLESS-captured trace still
      renders; note in spec if a re-capture is needed (defer if so).
- [x] **T17 — refactor**: tidy, keep tests green; update spec status `clarified → done`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format .`
- [x] `pytest -q` green (needs `OPENAI_API_KEY`; keyless guard tests still run)
- [x] `npm run build` passes (`tsc --noEmit` + build) · `npm test` (Vitest) green
- [x] No protocol change (confirmed `schemas.py` ↔ `events.ts` untouched); every Stage still
      mapped to a station
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
