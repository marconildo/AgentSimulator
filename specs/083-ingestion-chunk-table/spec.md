# Spec: Chunk table + full-text inspector in the Ingestion pipeline drill-in

| | |
|---|---|
| **ID** | 083-ingestion-chunk-table |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-20 |

> Fill the WHAT and the WHY. **No implementation detail here.**

## Problem / motivation

The **Ingestion pipeline — this upload** drill-in (`IngestionPipelinePanel`,
opened from the merged ingestion station, 080) renders the Chunking phase as a
single free-text **"chunk previews"** block: the first ~160 characters of the
first **four** chunks, concatenated into one paragraph. A learner cannot see
**how many chunks there are**, cannot tell **where one chunk ends and the next
begins**, and can **never read a chunk in full** — the most important artifact of
the whole pipeline (the unit that gets embedded and retrieved) is the one thing
the view hides.

Make the chunks first-class: list **every** chunk as a selectable row and let the
learner open any one to read its **complete** text.

## Goals

- In the Chunking phase, show **all** chunks of the upload as a **table** — one
  row per chunk, with its index, size (chars), token count, and a short snippet.
- Let the learner **select a row** to view that chunk's **full text** (the real
  text that was embedded — no truncation).
- Keep it an honest **pure projection** of the real trace (§3): the full text
  comes from the actual ingestion run, not a re-request or a fabrication.

## Non-goals

- No new `Stage`, no new station/hop/tier, no timeline-phase change.
- No change to chunking logic, the `chunk-preview` endpoint, or retrieval.
- Not editing chunks; this is read-only inspection.

## User-facing behavior

- In the Ingestion drill-in's **Chunking** phase, the free-text "chunk previews"
  paragraph is **replaced by a table** with a row per chunk: **#**, **chars**,
  **tokens** (when available), and a one-line **preview** snippet.
- **Selecting a row** opens that chunk's **full text** below the table; the
  selected row is visually marked. Selecting another row swaps the text.
- The table lists **every** chunk produced (not just the first four).
- When a trace predates this feature (only legacy previews available, e.g. an old
  captured demo trace), the table still renders one row per available preview and
  the "full text" shows the preview text — **no fabricated chunks, no crash**.
- All new user-facing strings ship in **en + pt**.

## Acceptance criteria

1. **AC1** — The Chunking phase renders a table with **one row per chunk** for the
   upload (row count == `num_chunks`), each row showing the chunk index and its
   character count.
2. **AC2** — Selecting a chunk row reveals that chunk's **full text** (the
   complete chunk string from the trace, not the truncated snippet); selecting a
   different row replaces it with that chunk's text.
3. **AC3** — The full chunk text is sourced from real trace data emitted by the
   ingestion run (`rag.ingest.chunk` carries the full chunk texts); it is a pure
   projection of the visible cursor slice (step/replay safe), with no extra
   request and no fabrication.
4. **AC4** — When only legacy preview data is present (no full chunk texts), the
   table degrades gracefully: it renders the available previews as rows without
   error and without inventing chunks.
5. **AC5** — Every new user-facing string exists in both `en` and `pt`.
6. **AC6** — Additive only: the new payload key is additive on an existing event,
   no `Stage`/protocol/timeline change; omitting this feature leaves the rest of
   the app behavior unchanged (default path otherwise byte-for-byte).

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Additive `data` key `chunk_texts: string[]`
  (full text of every chunk) on the existing `rag.ingest.chunk` END event.
- Mirror in `frontend/src/types/events.ts`: **n/a** (the `data` payload is an
  untyped `Record`; no `Stage`/`Phase` enum change).
- Station it maps to: **ingestion** (existing) — drill-in UI only.

## Open questions (clarify before planning)

- [x] Table vs. expandable list? → **Table** with a selectable row + full-text
  panel (user choice, screenshot).
- [x] Where does the full text come from? → **Real trace** — emit full chunk
  texts on the existing `rag.ingest.chunk` event (no new endpoint, no re-request).

## Out of scope / deferred

- Per-chunk metadata / embedding vector shown alongside the full text (the
  metadata phase already lists records; could be cross-linked later).
- Copy-to-clipboard / search within a chunk.
