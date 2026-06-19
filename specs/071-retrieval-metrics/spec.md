# Spec: Retrieval-quality metrics (Precision@k · Recall@k · MRR)

| | |
|---|---|
| **ID** | 071-retrieval-metrics |
| **Status** | ~~draft → clarified → planned → in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-18 |

> The first member of the *measurement* family. The reranker (054) and hybrid search (070)
> **claim** they improve retrieval; this spec **measures** it. Like them, it is a query-time
> addition to the `rag` (Vector DB) station — **no new tile, no new `Stage`** — that rides
> additively on the existing `rag.retrieve` event and surfaces in the RAG drill-in. The Simple
> rung (and every query without ground truth) stays **byte-for-byte** unchanged.

## Problem / motivation

The whole Intermediate RAG-quality story — *why add a reranker? why fuse BM25? why MMR later?* —
is currently **asserted**, never **shown**. A learner toggles the reranker on and sees ranks move,
but has no way to answer the only question that matters: *did the right chunk actually end up near
the top?* Without a labelled ground truth, "better retrieval" is a vibe.

This spec gives the visualizer an honest yardstick. A small **golden set** (labelled
query → relevant-source pairs) lets us compute the standard retrieval-quality metrics —
**Precision@k**, **Recall@k**, **MRR** — for any run whose query is in the set, and display them
right where the chunks are shown. Now "rerank helped" becomes *"Precision@k went 0.50 → 0.75,
the relevant chunk moved from rank 4 to rank 1"* — measured, not claimed. This is the course's
M2U3.1 §4 retrieval-quality material made real and inspectable.

## Goals

- Ship a **real, labelled golden set** under `backend/app/data/` (queries the existing corpus can
  actually answer, each tagged with the source file(s) that are *relevant*).
- Compute **Precision@k**, **Recall@k** and **MRR** over the retrieved chunks **whenever the run's
  query matches a golden entry**, and attach the result **additively** to the `rag.retrieve` END
  (no new `Stage`).
- **Be honest when there is no ground truth** (§3): an unlabelled query gets **no metrics** and the
  drill-in says so plainly — we never invent a score.
- Surface the metrics in the **RAG drill-in** Retrieval step: the headline numbers, *which retrieved
  chunks were relevant* (✓/✗ per chunk), and *which relevant chunks were missed* (the Recall gap).
- Expose the golden queries via **`/api/config`** so the UI can offer them as one-click **benchmark
  suggestions** — making the feature discoverable instead of hidden behind guessing the exact query.
- Keep **Simple / unlabelled runs byte-for-byte**: no `eval` data, identical event stream.

## Non-goals

- A new `Stage`, a new station, or a new tile — metrics ride on `rag.retrieve`.
- An automatic A/B (rerank-on vs rerank-off in one run) side-by-side — compelling, but its own
  later spec; this spec measures **the current run only** (the user toggles rerank/hybrid in the
  builder and watches the number change across two sends).
- The full **RAGAS** answer-quality suite (faithfulness, answer-relevancy) — that stays in the
  Advanced **Eval Runner**. This spec is *retrieval-only* metrics.
- Editing the golden set from the UI (it ships as a file; CRUD is out of scope).
- LLM-as-judge labelling — the golden set is hand-authored ground truth.

## User-facing behavior

- In the **RAG drill-in** (`RagPipelinePanel`), the Retrieval step gains a **Quality** readout:
  `P@k 0.75 · MRR 1.00 · Recall 0.67` when the query is a benchmark, plus a per-chunk relevance
  mark (✓ relevant / ✗ not) and a short list of **relevant chunks that were missed**.
- When the query is **not** in the golden set, the Quality area shows a calm one-liner: *"No ground
  truth for this query — metrics need a labelled benchmark query."* (en) / *"Sem gabarito para esta
  pergunta — as métricas precisam de uma pergunta de benchmark rotulada."* (pt) — never a fake 0.
- The drill-in (and/or composer empty state) offers the **benchmark queries** as clickable chips so
  a learner can fire one and immediately see the metrics light up; toggling the reranker/hybrid in
  the Build popover and re-sending the same benchmark shows the metric move.
- A short glossary entry for **Precision@k**, **Recall@k** and **MRR** (what each means, why it
  matters), in en + pt.

## Acceptance criteria

1. **AC1 (golden set is real & validated)** — A labelled golden set file exists under
   `backend/app/data/` with ≥ 6 entries, each `{ id, query, relevant_sources: [<corpus filename>…] }`,
   and every `relevant_sources` entry names a file that actually exists in the corpus. A test loads
   it, validates the schema, and asserts the referenced sources exist.
2. **AC2 (metric math is correct)** — A pure function computes Precision@k, Recall@k and MRR from
   `(ranked_sources, relevant_sources, k)`. Unit tests with hand-constructed rankings assert exact
   values (e.g. relevant at rank 1 → MRR 1.0; relevant at rank 3 → MRR ≈ 0.333; P@k / Recall@k over
   a known overlap).
3. **AC3 (metrics attach only for labelled queries)** — Running the agent with a query that matches
   a golden entry yields a `rag.retrieve` END carrying an `eval` object
   (`precision_at_k`, `recall_at_k`, `mrr`, `k`, `relevant_count`, plus a per-retrieved-chunk
   `relevant: bool` and the list of missed relevant sources). An **unlabelled** query yields a
   `rag.retrieve` END with **no `eval` key**.
4. **AC4 (byte-for-byte for unlabelled / Simple)** — For an identical unlabelled query, the ordered
   list of emitted `Stage`s and the `rag.retrieve` END `data` keys are **unchanged from today**
   (the `eval` key is absent). A structural test pins this.
5. **AC5 (real signal: metric is wired to the pipeline)** — `@pytest.mark.openai` structural test:
   for a benchmark query, the metric is computed end-to-end **both with and without** the reranker,
   yielding valid values in `[0,1]` with the relevant chunk actually found (MRR > 0). *Amended
   2026-06-19:* the original "rerank MRR ≥ no-rerank MRR" was dropped — reranking legitimately
   reorders, so it can move the first relevant chunk either way on a given query; asserting it never
   hurts is empirically false and made the test flaky. The honest claim is that the metric is real
   and responds to the pipeline, which the bidirectional structural check pins.
6. **AC6 (config exposes benchmarks)** — `GET /api/config` includes a `benchmark_queries` array
   (`{ id, query }`), drawn from the golden set, so the UI can render one-click suggestions without
   hardcoding.
7. **AC7 (drill-in renders metrics honestly)** — The RAG drill-in Retrieval detail renders the
   Quality readout + per-chunk ✓/✗ + missed-relevant list when `eval` is present, and the calm
   "no ground truth" line when it is absent. A Vitest covers both paths.
8. **AC8 (pure projection)** — The `eval` payload flows through `deriveRagPipeline` into the
   Retrieval stage data with no new request and no extra fetch (live + replay share the path).
9. **AC9 (bilingual)** — Every new string (Quality, Precision@k, Recall@k, MRR, the no-ground-truth
   line, missed-relevant label, the three glossary entries) exists in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — metrics ride additively on the existing `rag.retrieve` END
  `data` (`eval` object), exactly as 036 added `context_budget` to `llm.prompt`.
- New `ChatRequest` field: **none** — metrics auto-compute when the query matches the golden set.
- Mirror in `frontend/src/types/events.ts`: the open `data` map already permits it; add an optional
  `RetrievalEval` interface for type-safety (additive, no `Stage`/`Phase` change).
- Station it maps to: **`rag`** (the existing Vector DB station; `rag.retrieve` already lives there).

## Resolved decisions (clarify — 2026-06-18)

- [x] **No new `Stage`** — additive on `rag.retrieve` (lower risk, mirrors 036's `context_budget`).
- [x] **Metrics only for labelled queries** — honesty (§3): no ground truth ⇒ no number, with an
      explicit UI message. This also keeps unlabelled / Simple runs byte-for-byte (AC4).
- [x] **Match by query string** — a golden entry matches when the run's *retrieval query* (the
      model's `search_knowledge_base` argument, else the user message) equals a golden `query`
      (case/space-normalised). Benchmark chips send the exact string, so the match is reliable.
- [x] **Relevance is at the source-file granularity** — a retrieved chunk counts as relevant iff its
      `source` is in the entry's `relevant_sources`. Chunk-level labelling is deferred (heavier, and
      file-level already demonstrates the metrics).
- [x] **k = the run's `top_k`** — metrics are computed over the chunks that actually reached the
      prompt (post-rerank/threshold), so they measure *what the LLM saw*.

## Out of scope / deferred

- In-run A/B (rerank-on vs rerank-off side-by-side) — own spec; pairs naturally with this one.
- Chunk-level relevance labels and nDCG — file-level P@k/Recall/MRR first.
- The full RAGAS answer-quality suite → Advanced **Eval Runner**.
- Editing/managing the golden set from the UI.
- Wiring the same metrics through the RAGLESS / PageIndex path (PageIndex selects sections, not
  ranked chunks — measuring it needs its own mapping; revisit after this lands).
