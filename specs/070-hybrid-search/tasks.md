# Tasks: 070-hybrid-search (TDD checklist)

Ordered red → green → refactor. Each implement task is preceded by the failing test that drives
it. Check boxes as you go; move `spec.md` status along (`clarified → planned → in-progress →
done`).

## 0. Setup
- [x] T0 — `pip install rank-bm25`; add `rank-bm25` to `backend/requirements.txt`.

## 1. BM25 + RRF core (keyless, deterministic) — AC2
- [x] T1 (red) — `backend/tests/test_hybrid_unit.py`: `test_rrf_is_rank_based` (a chunk #1 in
      one lane and absent in the other still scores `1/(60+1)`; a chunk top-ranked in **both**
      beats one top-ranked in only one) + `test_bm25_ranks_exact_token` (a doc containing a rare
      literal token outranks one that doesn't for that query).
- [x] T2 (green) — `backend/app/rag/hybrid.py`: `bm25_rank`, `rrf_fuse`, `HybridResult`.

## 2. Schema + config — AC5 (backend half), AC1 plumbing
- [x] T3 (green) — `schemas.py`: `Stage.RAG_HYBRID`; `ChatRequest.hybrid: bool = False`.
- [x] T4 (green) — `config.py`: `rrf_k`, `bm25_top_k`.

## 3. Retriever integration — AC1, AC2, AC3, AC4
- [x] T5 (red) — `backend/tests/test_retriever_hybrid.py`:
      `test_hybrid_stage_fires_in_order`, `test_off_emits_no_hybrid`,
      `test_off_stage_sequence_unchanged` (AC4), `test_bm25_rare_token_surfaces_chunk` (AC2),
      `test_hybrid_then_rerank_order_and_pool` (AC3).
- [x] T6 (green) — `retriever.py`: `retrieve(..., hybrid=False)`; emit `RAG_HYBRID` between
      `RAG_SEARCH` and rerank; fused pool feeds the existing rerank/trim path; `fetch_k`
      widening when hybrid.

## 4. Graph + API wiring — AC1, AC8 (backend half)
- [x] T7 (green) — `graph.py`: thread `hybrid` through `run_agent`/`run_agent_state`/state →
      `rag_retrieve`.
- [x] T8 (green) — `main.py`: `hybrid=req.hybrid`; echo `request_body["hybrid"]` when on.

## 5. Protocol mirror + projection — AC5, AC6
- [x] T9 (red) — extend `phases.test.ts` (parity/exhaustiveness already enforce it once the
      union grows) and `stations.test.ts` (`rag.stages` includes `rag.hybrid`; **no** `hybrid`
      station id resolvable).
- [x] T10 (green) — `events.ts` add `"rag.hybrid"`; `phases.ts` map → `retrieve`;
      `stations.ts` add to `rag.stages`, **delete the `hybrid` station**, add glossary
      `Hybrid search`/`BM25`/`RRF` (en+pt).

## 6. Selection + overrides — AC8
- [x] T11 (red) — `selection.test.ts`: `hybrid` is real; `requestInputs` sets `hybrid` only on
      Vector RAG; switching to RAGLESS clears it. `experiment` override sends `hybrid` when on.
- [x] T12 (green) — `selection.ts`: `COMPONENT_IS_REAL.hybrid=true`; drop
      `COMPONENT_STATION.hybrid`; `requestInputs`/`currentRequestInputs` return `hybrid`.
      `experiment.ts`: `ChatOverrides.hybrid` + `overridesFor`.

## 7. Readout + inspector + drill-in — AC6, AC7, AC9
- [x] T13 (red) — Vitest for `readoutFor` (rag → `BM25+vector · fused N`) and the drill-in
      Retrieval render: hybrid (3-column Vector|BM25|→RRF) vs non-hybrid (single list).
- [x] T14 (green) — `FlowCanvas.readoutFor`, `InspectorPanel.renderDetail`,
      `ragPipeline.deriveRagPipeline`, `RagStageDetail`/`RagPipelinePanel`; all new strings
      en+pt in `strings.ts`.

## 8. Gates
- [x] T15 — `ruff check . && ruff format .` · `pytest -q` (with `OPENAI_API_KEY`) ·
      `npm run build` (`tsc --noEmit` + vite) · `npm test`. Protocol mirror in sync, every
      `Stage` mapped (§6), all new text en+pt (§4). Move spec status → `done`.
