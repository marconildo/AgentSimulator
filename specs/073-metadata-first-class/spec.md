# Spec: Metadata as a first-class citizen

| | |
|---|---|
| **ID** | 073-metadata-first-class |
| **Status** | ~~draft → clarified → planned → in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-18 |

> The third measurement/quality step, and the **foundation for self-querying** (future). Today a
> chunk knows almost nothing about itself (`corpus`, `source`, `title`, `chunk` index). This spec
> makes metadata rich at ingest, **filterable** at retrieval, and **visible** on every retrieved
> chunk — so the learner can finally answer *"why did this chunk get retrieved?"*. Ingests alongside
> [072](../072-chunking-strategies/spec.md) (same re-ingest path) and is measured by
> [071](../071-retrieval-metrics/spec.md).

## Problem / motivation

Retrieval looks like magic because the chunks are anonymous: the inspector shows text + a similarity
score, but nothing about *what* the chunk is — which document, which section, what kind of content,
how old. So the most important debugging question in RAG — *"why did this chunk come back, and should
it have?"* — can't be asked. And the powerful Intermediate technique that depends on it,
**self-querying** (natural language → metadata filter, *"papers by X after 2023"*), has no metadata
to filter on.

This spec makes metadata first-class: **extract** useful fields at ingest (source, title, section
heading, doc type, position), **carry** them through search → retrieve to the UI, **filter** on them
at retrieval (the `where=` seam Chroma already supports), and **show** them on each retrieved chunk
as a "why retrieved" panel. It deliberately stops short of the LLM self-query step — it builds the
**foundation** that a later self-querying spec sits on, while already paying off on its own (metadata
chips + a manual filter make retrieval legible today).

## Goals

- **Extract richer metadata at ingest**: per chunk — `source`, `title`, `section` (nearest markdown
  heading), `doc_type`, `position` (chunk index / total), plus any document **frontmatter** if
  present. Real, derived from the actual corpus files (§3).
- **Carry metadata end-to-end**: the chunk dicts emitted on `rag.search` / `rag.retrieve` include the
  metadata, through `deriveRagPipeline` into the UI.
- **Filterable retrieval**: `retriever.retrieve` accepts an optional metadata filter → Chroma
  `where=`, restricting results (the seam self-querying will drive). Expose a **minimal manual
  filter** in the UI so it's usable today.
- **"Why retrieved" visibility**: each retrieved chunk shows its metadata chips (source · section ·
  type · position) in the Vector DB inspector + the RAG drill-in, beside its similarity/rank — making
  the retrieval decision legible.
- All new prose en + pt (§4); backward-safe with a legacy index (missing fields don't crash).

## Non-goals

- The **LLM self-querying** step (natural language → structured filter) — its own future spec; this
  spec is the metadata + filter **foundation** it requires.
- A new `Stage`, station or tile — metadata rides existing chunk dicts on `rag.search`/`rag.retrieve`
  and the existing Vector DB station + RAG drill-in.
- Metadata for **user-uploaded** PDFs beyond what's already captured (revisit with the upload
  re-chunk path; corpus first).
- Automatic metadata *inference* via an LLM (e.g. guessing author/date from prose) — extract what's
  structurally present; LLM extraction is deferred.
- Per-metadata retrieval-quality analytics — that's 071's job once labelled.

## User-facing behavior

- In the **Vector DB inspector** and the **RAG drill-in** Retrieval detail, each retrieved chunk
  gains a compact **metadata chip row**: `source.md · §Section · type · 3/12`, beside its similarity
  and rank. A short *"why retrieved"* framing ties the metadata + score together.
- A **minimal metadata filter** affordance (e.g. filter retrieval to one source / one doc type) in
  the RAG drill-in or Settings, so the learner can *see* filtering change the results — the visible
  precursor to self-querying. (Scope: at least one filterable field with a working round-trip.)
- Glossary entries for **Metadata** and **metadata filtering** (and a forward note that self-querying
  will automate the filter), en + pt.

## Acceptance criteria

1. **AC1 (rich extraction at ingest)** — After re-ingesting the corpus, each chunk's metadata
   includes `source`, `title`, `section` (the nearest preceding markdown heading), `doc_type`, and
   `position` (`{index, total}`), plus parsed frontmatter fields when the file has them. A test
   asserts these fields are present and correct for a known corpus file (e.g. a chunk under a `##`
   heading carries that heading as `section`).
2. **AC2 (metadata carried to the UI)** — The chunk dicts on `rag.search` and `rag.retrieve` END
   carry the metadata fields; `deriveRagPipeline` exposes them on each `PipelineChunk`. A test asserts
   a retrieved chunk surfaces its `section`/`doc_type` through the projection.
3. **AC3 (filterable retrieval)** — `retriever.retrieve(..., filters=…)` translates a metadata filter
   into a Chroma `where=` and restricts results. A test asserts that filtering by `source` returns
   only chunks from that source (and unfiltered returns the full scope), composing with the existing
   `_scope_filter` (`corpus`/`session_id`).
4. **AC4 (byte-for-byte when no filter)** — With no `filters` argument, the emitted `Stage`s and the
   `rag.search`/`rag.retrieve` event shapes are unchanged from today except the additive metadata
   keys on each chunk. A structural test pins the stage sequence.
5. **AC5 (legacy-index safe)** — A chunk lacking the new metadata (an index built before this spec)
   still retrieves and renders — the UI shows only the fields present, no crash. A test feeds a
   metadata-poor chunk through the projection + render.
6. **AC6 ("why retrieved" renders)** — The Vector DB inspector + RAG drill-in render the metadata
   chip row per retrieved chunk. A Vitest asserts the chips appear for a metadata-rich chunk and
   degrade gracefully for a poor one.
7. **AC7 (filter seam — backend)** — `retriever.retrieve(..., filters=…)` translates a metadata
   filter into a Chroma `where=` AND-ed with the existing `_scope_filter`, and a keyless unit test
   pins the `_with_filters(scope, filters)` merge (none → scope unchanged; one field → `$and` of
   scope + equality). *Amended 2026-06-19:* the live **UI filter control** (and its chat-request →
   agent-tool plumbing) is **deferred to the future self-querying spec** — that spec is the natural
   driver (NL → filter), and threading a manual `retrieval_filters` through the agent loop now would
   entangle with the in-flight `graph.py` changes from spec 074 and depend on the flaky chromadb
   query path. 073 ships the **seam + the metadata visibility** that self-querying builds on.
8. **AC8 (no new Stage / station)** — No `Stage` added; `STAGE_TO_STATION`/`STAGE_TO_PHASE`
   unchanged; exhaustiveness/`tsc` green.
9. **AC9 (bilingual)** — Every new string (chip labels, "why retrieved", filter controls, 2 glossary
   entries + the self-query forward note) exists in en + pt.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — metadata are additive keys on the existing chunk dicts carried
  by `rag.search` / `rag.retrieve` (open `data` map).
- New `ChatRequest` field: **none** required for the foundation; the **manual filter** may add a
  small optional request input (e.g. `retrieval_filters`) — request-only, defaulting to none
  (byte-for-byte when absent). Decide in plan (kept minimal / optional).
- Mirror in `events.ts`: extend the `PipelineChunk`/chunk type with optional metadata fields
  (additive; no `Stage`/`Phase` change).
- Station: the **existing** Vector DB (`rag`) station + RAG drill-in.

## Resolved decisions (clarify — 2026-06-18)

- [x] **Foundation, not self-query.** This spec ships metadata + the filter *seam* + visibility; the
      LLM natural-language → filter step is a separate later spec that consumes this.
- [x] **Extract what's structurally present** (headings, frontmatter, file/type/position). No LLM
      inference of author/date — keep it real and deterministic; LLM extraction is deferred.
- [x] **`section` = nearest preceding markdown heading** of the chunk's first line — cheap, real, and
      genuinely useful for "why retrieved".
- [x] **Filter composes with `_scope_filter`** — metadata filters are AND-ed with the existing
      `corpus`/`session_id` scope, so uploads-vs-corpus isolation is preserved.
- [x] **Re-ingest required** to populate metadata — reuses 072's re-ingest path; legacy chunks render
      degraded (AC5) until rebuilt, and the active state is honest.

## Out of scope / deferred

- LLM **self-querying** (natural language → structured filter) — the next spec; depends on this.
- LLM-based metadata *inference* (author/date/topic from prose).
- Metadata for user-uploaded PDFs beyond current capture.
- **The live UI filter control + its chat-request/agent-tool plumbing** — deferred to the
  self-querying spec (see AC7 amendment). 073 ships the retriever `filters=` seam + metadata
  visibility; self-query wires the NL → filter control on top.
- Rich filter UI (multi-field, ranges) — arrives with self-querying.
- Per-metadata retrieval analytics (overlaps 071).
