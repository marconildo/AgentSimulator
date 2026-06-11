# Spec: RAG block expansion (Vector DB → full RAG drill-in + real reranker)

| | |
|---|---|
| **ID** | 054-rag-block-expansion |
| **Status** | ~~draft → clarified → planned → in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-10 |

> First real node of the **Intermediate** rung of the maturity ladder (008). This spec
> is deliberately scoped so the **Simple** rung stays byte-for-byte unchanged — see
> "Scenario isolation" below. RAGLESS / PageIndex is **out of scope here** (spec 055);
> DeepAgents is spec 056.
>
> **Amendment (2026-06-11, post-review).** The standalone **`reranker` station tile was
> removed**: reranking is a **query-time sub-stage of the `rag` (Vector DB) station**, not a
> separate floating node. `rag.rerank` now maps to the `rag` station (its `stages` are
> `embed → search → rerank → retrieve`); it animates the Vector DB tile, surfaces a
> `reranked N→K` readout there, and its before/after detail lives in the RAG drill-in
> + the Vector DB inspector. The reranker's cloud examples moved to the Learn `reranker`
> topic as inline notes. AC4/AC5 below reflect this; the rerank backend behavior is unchanged.
>
> **Amendment 2 (2026-06-11, post-review #2).** Two fixes from live testing:
> 1. **Bug — scenario wasn't sent.** `ChatOverrides`/`overridesFor` (`lib/experiment.ts`) never
>    forwarded the global `useScenario` rung, so the backend always ran `simple` and **never
>    reranked even on Intermediate** (Retrieval showed 4 candidates, not the wider pool; rerank
>    "inactive"). Fixed: `overridesFor` now sends `scenario` when away from `simple`.
> 2. **RAG drill-in reworked from a full-page overlay to an anchored, live-animating pipeline
>    panel** (`RagPipelinePanel`, replacing `RagDetail`). It floats **beside the Vector DB node
>    on the canvas** (reusing TourCaption's viewport anchoring), so the rest of the flow stays
>    visible, and lays out the query-time pipeline **Embedding → Retrieval → Rerank → Augmented**
>    as cards that light up live (done/active/pending) as the trace cursor advances. **Chunking
>    is shown as the offline (ingestion) precursor** — honest, since there is no query-time
>    chunking. **"Augmented"** (new) is the "A" in RAG: the retrieved chunks assembled into the
>    prompt context sent to the LLM (read from `llm.prompt` `context_budget.retrieved`). Pure
>    projection in `lib/ragPipeline.ts` (`deriveRagPipeline`).
>
> **Amendment 3 (2026-06-11, post-review #3).** Each pipeline card is now **clickable and drills
> into a per-stage detail** (`RagStageDetail`) showing the **real algorithm with an illustration**,
> below the card strip (follows the live cursor; a click pins a stage):
> - **Embedding** — the query's input text → its **real `o200k_base` token pieces** (new
>   `tokenizePieces` in `lib/tokenize.ts`) → the embedding **vector as signed bars** (the real
>   8-dim preview) + model/dim.
> - **Retrieval** — a **cosine vector-search illustration** (SVG): the query vector along +x and
>   each retrieved chunk drawn at its **real cosine angle** `acos(similarity)` from the query
>   (`cosineAngleDeg` helper), plus the cosine formula and a ranked list with similarity/distance
>   bars.
> - **Rerank** — the cross-encoder model, pool→k, and the full before/after rank movement
>   (reuses `RerankMovementList`).
> - **Augmented** — the **exact retrieved context string** injected into the prompt + its token
>   count/window.
> `deriveRagPipeline` was enriched with the per-stage detail data (query, full chunks, context).

## Problem / motivation

Today the whole of RAG is collapsed into a single "Vector DB" station that reads
`top-k · score`. That hides the actual pipeline a real RAG system runs — chunking,
embedding, retrieval and **reranking** — and the canvas's only reranker tile is a
non-executing `comingSoon` preview. Learners can't see *why* RAG quality is more than
"a vector search", and the Intermediate rung has no real, runnable node yet (so it can't
be sent).

This spec turns the Vector DB tile into an **expandable RAG block** (Transformer-Explainer
style: the box opens into a focused view of its internal stages) and makes the **reranker
real** on the Intermediate rung — the first honest, executable upgrade on that rung.

## Goals

- Give the `rag` station an **"open full view"** drill-in (like the Agent's) that lays out
  the RAG pipeline as inspectable stages: **Chunking → Embedding → Retrieval → Reranking**.
- Make the **reranker a real executing node** on the Intermediate rung: a real reranking
  pass re-scores the retrieved candidates and the reordered set becomes the grounding
  context. New `Stage rag.rerank`.
- **Activate the Intermediate rung** (`canSend("intermediate") → true`) now that it has a
  real executable upgrade.
- Keep **Simple byte-for-byte**: no `rag.rerank` is ever emitted on `scenario=simple`, no
  new visible station appears, the event sequence is identical to today.

## Non-goals

- RAGLESS / PageIndex retrieval (spec 055) — this spec only adds the **toggle-less** Vector
  RAG block; 055 adds the strategy switch inside it.
- DeepAgents runtime (spec 056).
- Hybrid search (BM25 + vector) — listed on the roadmap, deferred to its own spec.
- Changing ingestion-time chunking behavior. The drill-in *visualizes* chunking/embedding
  (reusing `ingestion`'s real `rag.ingest.*` data); it does not alter how indexing runs.
- Advanced-rung nodes (gateway, guardrails, cache, eval, observability, sub-agents) stay
  `comingSoon`.

## User-facing behavior

- The **Vector DB** tile gains an **"open full view ▸"** affordance (mirroring the Agent
  node). Opening it renders a focused **RAG drill-in** overlay with one panel per pipeline
  stage: Chunking, Embedding, Retrieval, Reranking — each composed client-side from existing
  trace events (no extra requests).
  - On **Simple**, the Reranking panel renders an **inactive/empty** state ("not on this
    rung") — pure projection, nothing faked.
  - On **Intermediate**, the Reranking panel shows the real rerank: the candidate set
    **before vs after** reordering (rank movement + scores), and which chunk now leads.
- On the **Intermediate** rung the **Reranker** tile is a normal executing station (no longer
  `COMING SOON`); its readout shows the rerank result, and the send button is enabled.
- All new labels/blurbs/glossary ship in **en + pt**.

## Acceptance criteria

1. **AC1 (rerank fires only on Intermediate)** — Given a query that triggers retrieval, when
   the agent runs with `scenario=intermediate`, then exactly one `rag.rerank` START/END pair
   is emitted, ordered **after** `rag.search` and **before** `rag.retrieve`. When the same
   query runs with `scenario=simple`, **no** `rag.rerank` event is ever emitted.
2. **AC2 (rerank is real & changes the order)** — The `rag.rerank` END event carries the
   reranked candidates with their **pre-rerank rank** and **post-rerank score/rank**, and the
   grounding context handed to the LLM uses the **reranked** ordering (the structural test
   asserts the reranked list is non-empty and its order is derived from the rerank pass, not a
   passthrough of `rag.search`).
3. **AC3 (Simple regression — byte-for-byte)** — For an identical query, the ordered list of
   emitted `Stage`s on `scenario=simple` is **unchanged from today** (no `rag.rerank`, no new
   stages, same count and order).
4. **AC4 (protocol mirror & totality)** — `Stage.RAG_RERANK` exists in `schemas.py` and is
   mirrored in `frontend/src/types/events.ts`; `STAGE_TO_STATION` maps `rag.rerank` → the
   **`rag`** station (it is a query-time RAG sub-stage; **no separate `reranker` station**);
   `STAGE_TO_PHASE` assigns it a `TimelinePhase`; `phases.test.ts` parity and the
   `Record<Stage, …>` exhaustiveness both pass (`tsc` clean).
5. **AC5 (rerank renders on the Vector DB station)** — The `rag` station owns `rag.rerank`
   (`stages: embed → search → rerank → retrieve`); on the Intermediate rung its `readoutFor`
   (FlowCanvas) shows `reranked N→K` and its `renderDetail` (InspectorPanel) shows the rank
   movement. There is **no standalone reranker tile** on any rung.
6. **AC6 (RAG drill-in)** — The `rag` station exposes an "open full view" that opens a RAG
   drill-in showing Chunking, Embedding, Retrieval and Reranking panels composed from trace
   events; with no `rag.rerank` event present the Reranking panel renders its inactive state
   (does not error). A Vitest covers both the populated (Intermediate) and empty (Simple) paths.
7. **AC7 (Intermediate is executable)** — `canSend("intermediate")` returns `true` and
   `GET /api/config` reports the `intermediate` scenario with `available: true`; the send
   button is enabled when the Intermediate rung is active.
8. **AC8 (bilingual)** — Every new user-facing string (drill-in panel labels, reranker
   readout/inspector text, glossary entries) exists in both `en` and `pt`.

## Protocol / stage impact

- New `Stage`: **`rag.rerank`** (`Stage.RAG_RERANK`).
- Mirror in `frontend/src/types/events.ts`: **required**.
- Station it maps to in `stations.ts`: **`rag`** (a query-time sub-stage; the separate
  `reranker` tile was removed in the 2026-06-11 amendment).
- `TimelinePhase` mapping for `rag.rerank` in `phases.ts`: `retrieve`.

## Scenario isolation (why Simple is safe)

1. The rerank sub-stage is emitted only on the Intermediate branch → on Simple the `rag`
   station's events are `embed → search → retrieve` exactly as today (no `rag.rerank`).
2. The rerank node/branch in the agent graph is guarded by `state.scenario == "intermediate"`
   (advanced inherits later) → Simple runs the exact same code path as today.
3. `rag.rerank` is additive in `STAGE_TO_STATION`/`STAGE_TO_PHASE` (keeps them total) but is
   **only emitted** on the Intermediate branch → Simple's projection is unchanged.
4. `canSend`/`/api/config` flip to `available: true` only for `intermediate`; `simple` is
   untouched. AC3 pins the byte-for-byte guarantee with a test.

## Resolved decisions (clarify — 2026-06-10)

- [x] **Reranker implementation → local FlashRank.** A real local reranker via LangChain's
      `FlashrankRerank` (`flashrank` + `onnxruntime`, no `torch`), default model
      `ms-marco-MiniLM-L-12-v2`. Chosen over OpenAI listwise (kept the stack honest *and*
      deterministic) and over `sentence-transformers` CrossEncoder (avoids dragging `torch`
      into the image). Deterministic ordering → tests can assert reordering with less tolerance,
      while still keeping structural asserts to stay robust.
- [x] **Drill-in → `AgentDetail`-style overlay.** A focused overlay over `<main>` (new
      `RagDetail`) mirroring the Agent's "open full view", for consistency with the Agent
      drill-in. Not the inline `⊕` expansion.
- [x] **Candidate pool → `fetch_k > top_k`, then trim.** Retrieval fetches a wider pool (e.g.
      8–12), the reranker re-scores it, and the trimmed reordered top-`top_k` becomes grounding.
      The wider-pool framing is the honest one (rerank only helps if it sees more than it
      returns) and makes real rank-movement visible in the drill-in.

## Out of scope / deferred

- RAGLESS / PageIndex toggle inside the RAG block → **spec 055**.
- Hybrid search (BM25 + vector) + fusion → future spec.
- Making rerank available on the Simple rung (intentionally not — Simple stays minimal).
