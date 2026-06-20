# Spec: Ingestion pipeline — merge Object Storage, expose phases

| | |
|---|---|
| **ID** | 080-ingestion-pipeline-merge |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

On the canvas the document-ingestion write-path is split across **two** boxes in
the AI & Data Services tier: a standalone **Object Storage** node and a separate
**Ingestion / Indexer** node. To a learner they read as two unrelated services,
when in fact storing the upload is just the *first step* of one ingestion
pipeline (persist → read back → chunk → embed → index). The split also makes the
tier taller and competes for attention with the RAG (query-time) node right
beside it.

Meanwhile, RAG already has the disclosure pattern we want: an **"Open RAG
pipeline"** drill-in that walks its phases (Chunking → Embedding → Retrieval →
Reranking) with the real data of each. Ingestion has no equivalent — its phases
(chunk → embed → store) are only visible as raw trace rows, and two real steps
that genuinely happen (per-chunk **tokenization** and **metadata extraction**)
aren't called out as phases at all.

This closes both gaps: one honest **Ingestion** block whose internals — starting
with object storage — are shown as ordered phases, mirroring the RAG drill-in.

## Goals

- Collapse the two boxes into **one `Ingestion` station**; **Object Storage
  becomes the first phase inside it**, not a sibling node.
- Give the Ingestion node a full-view drill-in (like "Open RAG pipeline") that
  walks its phases in order: **Object store → Chunking → Tokenization →
  Embedding → Metadata extraction → Save to vector DB**.
- Make Tokenization and Metadata extraction **real, first-class pipeline
  stages** (honest trace events, like RAG's sub-stages), each carrying the real
  data of that step.
- Keep ingestion **upload-only**: the whole block stays hidden on a normal chat
  and appears only when the trace shows an upload (unchanged from today).
- **Make per-PDF upload honor the active chunking strategy.** Today `ingest_pdf`
  is hardcoded to `recursive` and ignores the 072 strategy picker — only the
  corpus re-ingest respects it. Upload ingestion should chunk with the same
  strategy the live index uses, and the Chunking phase should report which one
  actually ran.

## Non-goals

- No change to the **query-time** RAG node or its drill-in.
- No change to *what* gets persisted to object storage or *which* Chroma
  collection chunks land in — only how the steps are staged and surfaced.
- Not adding a new deployable **tier**; ingestion stays in the AI & Data
  Services tier.
- No new request input on `ChatRequest` — ingestion phases are observed, not
  configured.

## User-facing behavior

- After a PDF upload, the canvas shows a **single "Ingestion" node** (no separate
  "Object Storage" box). The node animates through its phases as the upload is
  processed.
- The node exposes an **"Open ingestion pipeline"** action that opens a focused
  overlay (same shape as the RAG pipeline drill-in) listing the six phases in
  order, each with its real readout:
  - **Object store** — the durable object write (filename, key, store).
  - **Chunking** — strategy, chunk size/overlap, number of chunks, previews.
  - **Tokenization** — per-chunk token counts + total tokens (the cl100k count).
  - **Embedding** — model, vector dimension, number of vectors, a vector preview.
  - **Metadata extraction** — the per-chunk metadata records attached before
    indexing (e.g. section, position `i of N`, doc type, char range).
  - **Save to vector DB** — collection, chunks stored, total in collection.
- All new prose (node phase labels, drill-in headings, glossary entries) ships in
  **en + pt**.

## Acceptance criteria

1. **AC1** — Given a PDF upload, when ingestion runs, then the trace emits the
   stages **in order**: `storage.upload`, `rag.ingest.chunk`,
   `rag.ingest.tokenize`, `rag.ingest.embed`, `rag.ingest.metadata`,
   `rag.ingest.store` — each with a START and an END phase.
2. **AC2** — The `rag.ingest.tokenize` END event carries a per-chunk token-count
   list whose length equals the number of chunks, and a `total_tokens` metric
   equal to its sum.
3. **AC3** — The `rag.ingest.metadata` END event carries a per-chunk metadata
   list whose length equals the number of chunks; the metadata persisted on the
   stored Chroma chunks matches what this stage reports (it is real, not
   decorative).
4. **AC4** — Given a normal chat with **no** upload, when the turn runs, then
   none of `storage.upload` / `rag.ingest.*` fire — today's no-upload behavior is
   reproduced byte-for-byte.
5. **AC5** — Every `Stage` (including the two new ones and the remapped
   `storage.upload`) maps to **exactly one station** in `STAGE_TO_STATION` and to
   **exactly one `TimelinePhase`** in `STAGE_TO_PHASE`; `storage.upload` and all
   five `rag.ingest.*` stages map to the **`ingestion`** station.
6. **AC6** — The visual model no longer contains a standalone `storage` station:
   the upload-only set is `{ ingestion }`, and a PDF-upload trace renders a single
   Ingestion node (no Object Storage node).
7. **AC7** — The Ingestion node offers an "Open ingestion pipeline" drill-in that
   renders the six phases in order, each from existing trace events only (a pure
   projection — no extra network request).
8. **AC8** — Network hops stay consistent: an upload animates `backend → ingestion`
   and `ingestion → rag`, and **no** hop references a removed `storage` endpoint
   (no dangling hop is ever produced for a visible layout).
9. **AC9** — Every new user-facing string introduced by this feature exists in
   both `en` and `pt`.
10. **AC10** — Given a strategy selected in the chunking picker (the active index
    strategy), when a PDF is uploaded, then `ingest_pdf` chunks with **that**
    strategy (not a hardcoded `recursive`), and the `rag.ingest.chunk` END event
    reports the strategy actually used. Selecting `fixed` vs `recursive` yields
    observably different chunk boundaries for the same document.

## Protocol / stage impact

- New `Stage`s: **`rag.ingest.tokenize`**, **`rag.ingest.metadata`**.
- Remapped `Stage`: **`storage.upload`** moves from the `storage` station to the
  `ingestion` station (the station's `stages` array and `STAGE_TO_STATION`).
- Removed station: **`storage`** (its content folds into the Ingestion drill-in's
  "Object store" phase).
- Mirror in `frontend/src/types/events.ts`: **required** (two new enum members).
- Station they map to in `stations.ts`: **`ingestion`** (all six ingest stages).
- New `TimelinePhase` assignment in `STAGE_TO_PHASE` for both new stages.

## Open questions (clarify before planning)

- [x] New real Stages vs additive-only for tokenize/metadata? → **Real Stages**
  (user choice, 2026-06-19).
- [x] Inline expansion vs full-view drill-in? → **Full-view drill-in**, mirroring
  "Open RAG pipeline" (user choice, 2026-06-19).
- [x] Does removing the `storage` station drop a cloud-map entry we still want?
  → The object-storage cloud names (Blob/S3/Cloud Storage) are preserved on the
  Ingestion node's "Object store" phase content, so no cloud example is lost.

## Out of scope / deferred

- A **new** chunking-strategy picker on the drill-in. AC10 only makes upload
  *respect the existing* 072 picker (and report what ran); it does not add a new
  control. Metadata richness stays as 073 defines it.
- Re-capturing the GitHub Pages demo fixtures (058) — tracked separately per the
  standing demo directive; flag it after this ships.
