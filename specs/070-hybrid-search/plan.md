# Plan: 070-hybrid-search

> HOW. Mirrors the reranker (054) end-to-end since hybrid is the same shape: a request-only
> bool → a guarded query-time sub-stage of the `rag` station → a new `Stage` mirrored FE/BE →
> a drill-in view. Read alongside `spec.md` (the WHAT/WHY) and the 054 plan.

## Approach

The dense search already produces a ranked candidate pool (`rag.search`, `fetch_k` wide on the
Intermediate path). Hybrid adds a **second, sparse lane** and a **fusion step** between
`rag.search` and `rag.rerank`:

1. **BM25 lane.** Build a BM25 index over the **same scoped chunks** the dense search ranges
   over (`corpus == true` OR `session_id == active`). Tokenize query + chunks with a simple
   lowercase word split. Score → its own ranked list.
2. **RRF fusion.** For each chunk appearing in either lane, `score = Σ 1/(rrf_k + rank_i)` over
   the lanes that ranked it (`rrf_k = 60`). Sort desc → the fused pool. Carry, per fused chunk,
   `vector_rank`, `bm25_rank` (or `None`), and `rrf_score` for the trace.
3. The fused pool replaces the dense pool as the input to rerank (if on) / the top-k trim.

Honesty note: BM25 ranks the **whole scoped universe**, not just the dense candidates, so a
chunk the dense search missed entirely can still enter via the sparse lane — that's the whole
point. We fetch all scoped chunks once (`vectorstore.get(where=…)`) and index them in-process,
lazily, cached per `(scope)` for the request.

## Affected files

### Backend
- `backend/app/schemas.py` — add `Stage.RAG_HYBRID = "rag.hybrid"`; add `ChatRequest.hybrid:
  bool = False` (doc-commented like `rerank`).
- `backend/app/rag/hybrid.py` — **new.** `bm25_rank(query, chunks)` (lazy `rank_bm25` import,
  lowercase tokenizer) + `rrf_fuse(vector_ranked, bm25_ranked, rrf_k)` → `HybridResult(fused,
  movement)` dataclass (mirrors `reranker.RerankResult`: `fused` = reordered candidates with a
  1-based `rank` + `rrf_score`; `movement` = per-chunk `vector_rank`/`bm25_rank`/`rrf_score`).
- `backend/app/rag/retriever.py` — `retrieve(..., hybrid: bool = False)`. After the
  `RAG_SEARCH` stage, when `hybrid`, fetch the scoped chunks, run `bm25_rank`, `rrf_fuse`, and
  emit a `RAG_HYBRID` stage carrying `{ rrf_k, fused: N, candidates: movement }`; the fused
  list becomes `candidates` for the existing rerank/trim path. `fetch_k` widening also applies
  when `hybrid` (so both lanes have room).
- `backend/app/config.py` — `rrf_k: int = 60`, `bm25_top_k: int` (sparse pool width, default =
  `rerank_fetch_k`), `hybrid_fetch_k` reuse of `rerank_fetch_k`.
- `backend/app/agent/graph.py` — thread `hybrid` through `run_agent` → `run_agent_state` →
  `state["hybrid"]` → `rag_retrieve(..., hybrid=state["hybrid"])` (mirror `rerank`).
- `backend/app/main.py` — pass `hybrid=req.hybrid` into `run_agent`; echo
  `request_body["hybrid"] = True` only when on (mirror the `rerank`/`ragless` echoes).
- `backend/requirements.txt` — add `rank-bm25`.

### Frontend
- `frontend/src/types/events.ts` — add `"rag.hybrid"` to the `Stage` union (protocol mirror).
- `frontend/src/lib/phases.ts` — `STAGE_TO_PHASE["rag.hybrid"] = "retrieve"`.
- `frontend/src/lib/stations.ts` — add `"rag.hybrid"` to the `rag` station's `stages`
  (`embed → search → hybrid → rerank → retrieve`); **delete the `hybrid` station object**;
  glossary entries `Hybrid search` / `BM25` / `RRF`.
- `frontend/src/lib/selection.ts` — `COMPONENT_IS_REAL.hybrid = true`; remove
  `COMPONENT_STATION.hybrid` (no station now); `requestInputs`/`currentRequestInputs` return
  `hybrid` (`retrieval === "vector" && enabled.has("hybrid")`); `REQUIRES_VECTOR` already has
  it; clear-on-radio-switch already covers it.
- `frontend/src/lib/experiment.ts` — `ChatOverrides.hybrid?: boolean`; `overridesFor` sends it
  when on.
- `frontend/src/lib/ragPipeline.ts` (`deriveRagPipeline`) — read the `rag.hybrid` event into the
  Retrieval step's detail data: the two lanes + fused movement.
- `frontend/src/components/FlowCanvas.tsx` (`readoutFor`, `rag` case) — `BM25+vector · fused N`
  when a `rag.hybrid` event is present.
- `frontend/src/components/InspectorPanel.tsx` (`renderDetail`, `rag` case) — fusion movement
  block (reuse the rerank movement list component shape).
- `frontend/src/components/RagStageDetail.tsx` / `RagPipelinePanel.tsx` — Retrieval step gains
  the **Vector | BM25 | → RRF** three-column view when hybrid data is present; unchanged
  single-list view otherwise.
- `frontend/src/i18n/strings.ts` (+ any `*For(lang)` prose) — en + pt for all new labels.

## Protocol / i18n / cloud impact

- **Protocol (§1, §6):** one new `Stage` (`rag.hybrid`), mirrored in `events.ts`, mapped in
  both `STAGE_TO_STATION` (→ `rag`, via the station `stages` array) and `STAGE_TO_PHASE`
  (→ `retrieve`). One new request field (`hybrid`).
- **i18n (§4):** new prose in `stations.ts` glossary + `strings.ts` + drill-in labels, all
  `{ en, pt }`.
- **Cloud (§5):** **no new tier/station** → no cloud-map entry needed. (The deleted `hybrid`
  tile's `clouds` examples — AI Search hybrid / OpenSearch / Vertex Search — move into the
  glossary/Learn note for `Hybrid search` so the proper nouns aren't lost.)

## Test strategy (each AC → a test)

| AC | Test (file) | Kind |
|---|---|---|
| AC1 | `test_retriever_hybrid.py::test_hybrid_stage_fires_in_order` / `::test_off_emits_no_hybrid` | backend, structural |
| AC2 | `test_retriever_hybrid.py::test_bm25_rare_token_surfaces_chunk` + `test_hybrid_unit.py::test_rrf_is_rank_based` | backend, deterministic (no key) |
| AC3 | `test_retriever_hybrid.py::test_hybrid_then_rerank_order_and_pool` | backend, structural |
| AC4 | `test_agent.py` / `test_retriever_hybrid.py::test_off_stage_sequence_unchanged` | backend, byte-for-byte |
| AC5 | `phases.test.ts` (parity + exhaustiveness) + `tsc --noEmit` | frontend |
| AC6 | `stations.test.ts` (rag.stages includes hybrid; no `hybrid` station) + readout unit | frontend |
| AC7 | `RagPipelinePanel` / `ragPipeline` Vitest — hybrid vs non-hybrid Retrieval render | frontend |
| AC8 | `selection.test.ts` (hybrid real, vector-only, cleared on RAGLESS) + `experiment` override | frontend |
| AC9 | grep/test that each new string key has both `en` and `pt` | frontend |

BM25 + RRF are deterministic → AC2 can assert the rare-token chunk moves up with little
tolerance, while still asserting structurally (rank improved) to stay robust. `[openai]`-marked
tests (the agent end-to-end ones) skip without a key; the unit BM25/RRF tests run keyless.

## Rollout / risk

- **Perf:** per-request BM25 indexing over the scoped corpus is O(chunks); the demo corpus is
  small. If it grows, cache the index per scope (deferred). Off path pays nothing.
- **Determinism:** lowercase word-split tokenizer + `rank_bm25` are deterministic; no key.
- **Backwards-compat:** purely additive; `hybrid=false` is byte-for-byte (AC4).
