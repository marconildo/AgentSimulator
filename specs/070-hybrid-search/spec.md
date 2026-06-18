# Spec: Hybrid search (BM25 + vector, RRF fusion)

| | |
|---|---|
| **ID** | 070-hybrid-search |
| **Status** | ~~draft → clarified → planned → in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-18 |

> The next real RAG-quality upgrade after the cross-encoder reranker (054). Like the
> reranker, hybrid search is a **query-time sub-stage of the `rag` (Vector DB) station**, not
> a separate tile — the `hybrid` `comingSoon` preview tile (060) is **absorbed** into the RAG
> drill-in. The Simple rung (and any run with `hybrid=false`) stays **byte-for-byte** unchanged.

## Problem / motivation

Vector RAG retrieves by **meaning** (cosine over embeddings). That is exactly wrong for
**exact, rare tokens** — codes, acronyms, proper nouns, version numbers, error identifiers —
where the literal term carries the signal and the embedding blurs it. A learner can't *see*
this failure mode today: the canvas only ever shows one dense search, so "why would I add
keyword search?" is asserted in the roadmap, never demonstrated.

Hybrid search fixes that by running a **sparse (BM25 / keyword)** retrieval alongside the
**dense (vector)** one and **fusing** the two ranked lists with **Reciprocal Rank Fusion
(RRF)**. Because RRF is rank-based, it sidesteps the incompatible score scales (cosine 0..1
vs BM25 unbounded): a chunk that ranks well in *either* lane floats up; a chunk that ranks
well in *both* wins. This spec makes that real and, above all, **visible** — the headline is a
side-by-side **Vector | BM25 | RRF** view so the fusion math is inspectable, not claimed.

## Goals

- Make hybrid retrieval a **real executing sub-stage** on the Vector-RAG path: a real BM25
  pass over the same scoped chunks + RRF fusion of the dense and sparse rankings. New
  `Stage rag.hybrid`, mapped to the **`rag`** station (no new tile).
- **Compose with the reranker** (the clarified decision): pipeline becomes
  `embed → search (dense) → hybrid (BM25 + RRF) → [rerank] → retrieve`. With `rerank` also on,
  the reranker re-scores the **fused** pool.
- Show the fusion **honestly and legibly**: a three-column **Vector | BM25 | → RRF** rank view
  in the RAG drill-in (reusing the reranker's rank-movement pattern), and a `BM25+vector ·
  fused N` readout on the Vector DB tile.
- **Real and keyless** (constitution §3): BM25 via a local pure-Python library, deterministic,
  no new required secret — mirroring how FlashRank kept the reranker honest.
- Keep **Simple / `hybrid=false` byte-for-byte**: no `rag.hybrid` is ever emitted, the event
  sequence is identical to today.

## Non-goals

- Replacing or changing the dense search, the embedding model, or ingestion-time chunking.
- A separate hybrid retriever *service*/tile — hybrid is a sub-stage of `rag` (clarified).
- Tuning RRF beyond a single configurable constant (`rrf_k`, default 60) — no learned weights,
  no per-query weighting.
- The RAGLESS / PageIndex path: hybrid is **vector-only** and is cleared when the retrieval
  radio switches away from Vector RAG (it cannot ride the reasoning-based path).
- Hybrid on the Simple rung (intentionally not — Simple stays minimal, like rerank).

## User-facing behavior

- A **Hybrid Search** component appears in the header **Build** popover as a **real**
  (executing) Vector-RAG sub-feature, beside the reranker (both gated on Vector RAG). The old
  `comingSoon` "Hybrid Search" tile is removed.
- When hybrid is enabled and a query triggers retrieval, the **Vector DB** tile animates the
  `rag.hybrid` sub-stage and shows a `BM25+vector · fused N` readout; the Inspector's Vector DB
  detail shows the fusion (each fused chunk's vector rank, BM25 rank, and RRF score).
- The **RAG drill-in** (`RagPipelinePanel`) Retrieval step splits into **two lanes (Vector /
  BM25) converging on an RRF fusion table**: the same chunks shown at their position in each
  lane and their fused rank/score. With no `rag.hybrid` event present, the Retrieval step
  renders exactly as today (single dense list) — no error, no empty hybrid scaffold.
- All new prose (component blurb, readout, inspector + drill-in labels, glossary: *Hybrid
  search*, *BM25*, *RRF*) ships in **en + pt**.

## Acceptance criteria

1. **AC1 (hybrid fires only when enabled, in order)** — Given a query that triggers retrieval,
   when the agent runs with `hybrid=true`, exactly one `rag.hybrid` START/END pair is emitted
   per retrieval, ordered **after** `rag.search` and **before** `rag.rerank`/`rag.retrieve`.
   With `hybrid=false` (and on Simple), **no** `rag.hybrid` event is ever emitted.
2. **AC2 (BM25 is real and fusion is rank-based RRF)** — The `rag.hybrid` END carries, for the
   fused candidates, each one's **vector rank**, **BM25 rank** (or "absent" when only one lane
   found it) and **RRF score**, and the fused order is `sort desc by Σ 1/(rrf_k + rank_i)`.
   A structural test asserts: a query built around an **exact rare token** present in a chunk
   that the dense search ranks low surfaces that chunk **higher in the fused order than in the
   pure-vector order** (BM25 demonstrably contributes), with deterministic BM25.
3. **AC3 (composes with rerank)** — With `hybrid=true` and `rerank=true`, the emitted order is
   `rag.embed → rag.search → rag.hybrid → rag.rerank → rag.retrieve`, and the reranker's input
   pool is the **fused** candidate set (the rerank `movement` is over fused candidates, not the
   raw dense list).
4. **AC4 (Simple / off regression — byte-for-byte)** — For an identical query, the ordered list
   of emitted `Stage`s with `hybrid=false` is **unchanged from today** (no `rag.hybrid`; same
   count and order, with or without rerank).
5. **AC5 (protocol mirror & totality)** — `Stage.RAG_HYBRID` exists in `schemas.py` and is
   mirrored in `frontend/src/types/events.ts`; `STAGE_TO_STATION` maps `rag.hybrid` → the
   **`rag`** station; `STAGE_TO_PHASE` assigns it the `retrieve` phase; `phases.test.ts`
   parity and the `Record<Stage, …>` exhaustiveness both pass (`tsc` clean).
6. **AC6 (renders on the Vector DB station)** — The `rag` station owns `rag.hybrid`
   (`stages: embed → search → hybrid → rerank → retrieve`); when present, its `readoutFor`
   (FlowCanvas) shows `BM25+vector · fused N` and its `renderDetail` (InspectorPanel) shows the
   fusion. There is **no standalone hybrid tile** on any rung; the 060 `comingSoon` tile is gone.
7. **AC7 (drill-in fusion view)** — The RAG drill-in Retrieval step renders the **Vector | BM25
   | → RRF** three-column view from the `rag.hybrid` event; with no such event it renders the
   single-dense-list view exactly as today. A Vitest covers both the hybrid and the
   non-hybrid path.
8. **AC8 (request wiring, vector-only)** — `hybrid` is a real toggleable `ComponentId`
   (`COMPONENT_IS_REAL.hybrid === true`), gated on the Vector-RAG retrieval radio
   (`requestInputs` only sets `hybrid` when `retrieval === "vector"`); switching the radio to
   RAGLESS clears it. `overridesFor` sends `hybrid: true` only when on; the default run's
   request body omits it.
9. **AC9 (bilingual)** — Every new user-facing string (component blurb, readout, inspector +
   drill-in labels, glossary `Hybrid search` / `BM25` / `RRF`) exists in both `en` and `pt`.

## Protocol / stage impact

- New `Stage`: **`rag.hybrid`** (`Stage.RAG_HYBRID`).
- New `ChatRequest` field: **`hybrid: bool = False`** (request-only input; no new pipeline node).
- Mirror in `frontend/src/types/events.ts`: **required**.
- Station it maps to in `stations.ts`: **`rag`** (query-time sub-stage; the `hybrid` tile is
  removed).
- `TimelinePhase` mapping for `rag.hybrid` in `phases.ts`: **`retrieve`** (same as `rag.rerank`).

## Scenario isolation (why Simple / off is safe)

1. `rag.hybrid` is emitted only when `retrieve(..., hybrid=True)` — guarded by the request flag,
   which is `False` by default and on Simple → the `rag` station's events stay
   `embed → search → (rerank?) → retrieve` exactly as today.
2. The BM25 index + fusion code is only built/run inside the `if hybrid:` branch → the off path
   is the exact same code as today (no BM25 import, no extra Chroma fetch).
3. `rag.hybrid` is additive in `STAGE_TO_STATION`/`STAGE_TO_PHASE` (keeps them total) but only
   *emitted* when on → the projection for an off run is unchanged. AC4 pins this with a test.

## Resolved decisions (clarify — 2026-06-18)

- [x] **Topology → sub-stage of the `rag` station** (mirror the reranker), not a separate tile.
      The 060 `comingSoon` `hybrid` tile is absorbed; `rag.hybrid` maps to `rag`.
- [x] **Composition → hybrid *then* rerank.** Pipeline `embed → search → hybrid → rerank →
      retrieve`; the reranker re-scores the fused pool.
- [x] **BM25 backend → local pure-Python (`rank_bm25`), deterministic, keyless.** Chosen to keep
      the run real (§3) without a new secret, exactly as FlashRank did for the reranker. BM25
      indexes the **same scoped chunks** the dense search ranges over (corpus + this
      conversation's uploads), so both lanes see the same candidate universe.
- [x] **Fusion → RRF with a single `rrf_k` constant (default 60).** Rank-based, so the
      incompatible cosine/BM25 score scales never need reconciling. No learned weights.

## Out of scope / deferred

- Weighted / learned fusion, query-dependent lane weighting.
- Exposing `rrf_k` as a user slider (config constant only for now).
- BM25 over a persisted index (rebuilt per process from the scoped chunks for now; revisit if
  corpus size makes per-request indexing too slow).
- Query expansion / HyDE before the lanes (shares RRF fusion; its own future spec).
