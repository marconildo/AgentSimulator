# Spec: Chunking strategies (configurable, visual, ingestion-time)

| | |
|---|---|
| **ID** | 072-chunking-strategies |
| **Status** | ~~draft → clarified → planned → in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-18 |

> Chunking is **upstream of every retrieval metric** — bad boundaries cap how good rerank (054),
> hybrid (070) or the metrics (071) can ever look. Today it's a single fixed strategy buried in
> `ingest.py`. This spec makes chunking a **configurable, visible, comparable** step: pick a
> strategy, *watch the same document chunk differently*, and re-ingest the corpus with the chosen
> one through an **animated ingestion flow**. Builds on [071](../071-retrieval-metrics/spec.md)
> (metrics give chunking a scoreboard) and is the foundation that [073](../073-metadata-first-class/spec.md)
> (metadata) ingests alongside.

## Problem / motivation

Ask a learner *"why does chunking matter?"* and the visualizer has no answer — the Chunking card in
the RAG drill-in just says *"built offline · N chunks"*. But chunking is where RAG quality is won or
lost: a **fixed-size** splitter cuts sentences in half and strands an answer across a boundary; a
**recursive/structural** splitter respects paragraphs; a **semantic** splitter starts a new chunk
when the *topic* shifts; an **agentic** splitter asks an LLM to segment the document into coherent
units. The differences are dramatic and *intensely visual* — but invisible here.

This spec turns chunking into the teaching centrepiece the course (M2U3.3) intends: a **playground**
that chunks the **same document four ways side by side** so the learner *sees* fixed cut a sentence
in half while semantic keeps the thought whole, and a **real re-ingestion flow** that rebuilds the
index with the chosen strategy and animates chunk → embed → store on the canvas. Everything is real
(§3): real splitters, real embeddings for the semantic boundary detection, a real LLM call for the
agentic one, a real rebuilt index.

## Goals

- Make chunking a **strategy, not a constant**: `fixed`, `recursive` (today's default), `semantic`,
  `agentic` — each a real implementation, selectable via config and per re-ingestion.
- **Default `recursive` reproduces today's `chunk_text` byte-for-byte** (a regression test pins it),
  so nothing changes unless the user opts into another strategy.
- A **read-only chunk playground**: an endpoint that chunks a sample/given document with a chosen
  strategy (or all of them) and returns the boundaries + per-chunk stats — *no embeddings, no index
  mutation* — so the Chunking drill-in can show **fixed vs. semantic vs. agentic** instantly and the
  learner sees *why fixed is worse*.
- A **real re-ingest-with-strategy** path from ⚙️ Settings that rebuilds the corpus index using the
  chosen strategy and **streams the ingestion trace** (`storage`/`rag.ingest.*`) so the canvas
  animates the ingestion flow end-to-end (reuses the 034 ingestion node — no new station).
- Chunks carry their **strategy** + boundary metadata, surfaced in the Chunking drill-in.
- All new prose en + pt (§4).

## Non-goals

- A new `Stage`, station or tile — chunking rides the **existing** ingestion stages
  (`rag.ingest.chunk/embed/store`, `storage.upload`) and the existing **Chunking card** in the RAG
  drill-in. (Adding a *playground panel* is UI inside that card, not a new station.)
- **Hierarchical / parent-child chunking** — it pairs with multi-vector retrieval; deferred to its
  own spec (noted in the roadmap).
- Changing retrieval, embedding model, rerank or hybrid — chunking is purely ingestion-time.
- Per-strategy *automatic* quality scoring in this spec — the metrics (071) exist and the learner can
  re-run a benchmark after re-ingesting, but an automated "best strategy" sweep is deferred.
- Re-chunking **user-uploaded** PDFs with the new strategies — this spec targets the **corpus**
  re-ingest path first; uploads keep today's behavior (revisit once corpus path is proven).

## User-facing behavior

- ⚙️ **Settings → Knowledge base** gains a **Chunking strategy** picker (`fixed` · `recursive` ·
  `semantic` · `agentic`) with a one-line explainer each, and a **Re-ingest corpus** button. Pressing
  it rebuilds the index with the chosen strategy and the **canvas animates** Storage → Ingestion →
  Vector DB as the chunks flow (reusing the upload ingestion flow). A progress/result toast reports
  the new chunk count.
- The **Chunking card** in the RAG drill-in becomes a **playground**: a strategy selector + a
  rendering of the **actual chunk boundaries** over a sample document, with **fixed shown alongside**
  the chosen strategy so the contrast is explicit (fixed splits mid-sentence in red; semantic/agentic
  keep units whole). Per-chunk stats (size, count) and a short *"why this matters"* explainer.
- The currently-active strategy is reflected (read from `/api/config`), so the learner knows which
  one the live index actually uses.
- Glossary entries for each strategy (fixed / recursive / semantic / agentic chunking), en + pt.

## Acceptance criteria

1. **AC1 (default is byte-for-byte)** — With `chunk_strategy = recursive` (the default), the chunks
   produced for every corpus file are **identical** to today's `chunk_text` output. A regression test
   pins this (same boundaries, same count).
2. **AC2 (four real strategies)** — `fixed`, `recursive`, `semantic`, `agentic` are each implemented
   behind one interface (`chunk(text, strategy) -> list[Chunk]`). Structural tests:
   - **fixed** produces windows of ≈`CHUNK_SIZE` that may split mid-paragraph/sentence;
   - **recursive** never starts a chunk mid-word and respects paragraph breaks;
   - **semantic** (`@openai`/embeddings) places ≥ 2 chunks on a document with a clear topic shift,
     with the boundary at the shift;
   - **agentic** (`@openai`) returns ≥ 1 segment, each non-empty.
3. **AC3 (config + per-ingest override)** — `chunk_strategy` is a setting (env `CHUNK_STRATEGY`,
   default `recursive`); `build_index(strategy=…)` honors an override; chunk metadata records the
   `strategy` used. A test asserts re-ingesting with `fixed` yields a different chunk count than
   `recursive` on the corpus and tags chunks with `strategy="fixed"`.
4. **AC4 (read-only playground endpoint)** — A `POST /api/rag/chunk-preview` (read-only) accepts
   `{ strategy | "all", text? }` and returns, per strategy, the ordered chunks (`text`, `start`,
   `end`, `chars`) **without** embedding or mutating the index. A test asserts `all` returns all four
   strategies and that `fixed` vs `recursive` differ for a sample with long paragraphs.
5. **AC5 (re-ingest streams the ingestion flow)** — Re-ingesting the corpus with a chosen strategy
   emits the **existing** ingestion stages (`storage.upload?`/`rag.ingest.chunk` → `rag.ingest.embed`
   → `rag.ingest.store`) over the trace/SSE so the canvas animates; the rebuilt index reflects the
   new strategy. A test asserts the stages fire in order and the index's chunk `strategy` metadata
   updates.
6. **AC6 (no new Stage / station)** — No `Stage` is added; `STAGE_TO_STATION` / `STAGE_TO_PHASE`
   are unchanged; the ingestion stages keep mapping to their existing stations. `tsc` exhaustiveness
   stays green.
7. **AC7 (Chunking playground renders)** — The Chunking drill-in renders the strategy selector and
   the boundary view with fixed shown alongside the chosen strategy (mid-sentence cuts visually
   flagged). A Vitest covers the comparison render from a `chunk-preview` payload.
8. **AC8 (active strategy surfaced)** — `GET /api/config` reports the active `chunk_strategy` and the
   available strategies (with labels); the UI reflects which one the live index uses. Test on config.
9. **AC9 (bilingual)** — Every new string (Settings picker + explainers, playground labels, the
   "why this matters" copy, 4 glossary entries) exists in en + pt.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — re-ingest reuses `rag.ingest.chunk/embed/store` (+ optionally
  `storage.upload`); chunk-preview is a plain read-only endpoint with no trace.
- New `ChatRequest` field: **none** (chunking is ingestion-time, not a chat input).
- New REST: `POST /api/rag/chunk-preview` (read-only) and a re-ingest action (trigger + SSE/stream
  of the existing ingestion stages). `/api/config` extended with `chunk_strategy` + strategy list.
- Mirror in `events.ts`: **n/a** (no protocol change); additive `data` on `rag.ingest.chunk`
  (`strategy`, boundary stats) only.
- Station: the **existing** ingestion stations + the **existing** Chunking card in the RAG drill-in.

## Resolved decisions (clarify — 2026-06-18)

- [x] **Strategy set = fixed · recursive · semantic · agentic.** `recursive` = today's default
      (byte-for-byte). `semantic` uses the existing embeddings to detect topic-shift boundaries;
      `agentic` asks the LLM to segment. Hierarchical/parent-child is **deferred** (multi-vector
      pairing).
- [x] **Playground is read-only and separate from re-ingest.** Comparing strategies must be instant
      and side-effect-free (no index churn), so `chunk-preview` never embeds/stores; only the
      explicit **Re-ingest** button mutates the index — and that one animates the real flow.
- [x] **Re-ingest reuses the 034 ingestion flow** (no new station/Stage). Stream **aggregated**
      ingestion stages for the whole corpus (one chunk→embed→store animation with counts), not one
      per chunk, to keep the trace legible.
- [x] **Corpus first, uploads later.** Scope the re-ingest path to the built-in corpus; user-upload
      re-chunking is deferred.
- [x] **Semantic/agentic are real and key-gated.** They use OpenAI (embeddings / LLM); with no key
      they raise like the rest of the app (no fake fallback, §3). `fixed`/`recursive` are keyless.

## Out of scope / deferred

- Hierarchical / parent-child chunking (→ pairs with multi-vector retrieval, own spec).
- Token-based fixed sizing (tiktoken windows) — char-based first; easy follow-up.
- Re-chunking user-uploaded documents with the chosen strategy.
- An automated "which strategy scores best" sweep using the 071 metrics (manual re-run for now).
- Tuning knobs (semantic similarity threshold, agentic max segments) as user-facing sliders —
  config constants for now.
