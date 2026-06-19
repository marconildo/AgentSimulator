# Spec: Per-strategy chunking configuration

| | |
|---|---|
| **ID** | 081-chunking-config |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

## Problem / motivation

072-chunking-strategies let the user *pick* a chunking strategy (Fixed / Recursive /
Semantic / Agentic) and re-ingest the corpus with it. But the parameters that actually
shape the chunks — window size, overlap, the semantic similarity threshold, the agentic
segment cap — are still **fixed constants** buried in `chunking.py`. The user can switch
the *kind* of chunker but cannot tune it, so the educational point ("chunk size and
overlap are the load-bearing knobs of RAG quality") is told but never shown.

This closes that gap: selecting a strategy in the 📚 Knowledge base settings reveals the
knobs **relevant to that strategy**, and re-ingest uses the chosen values for real
(real chunks, real embeddings, real index). It keeps the visualizer's promise that
everything on screen is honest and adjustable.

## Goals

- When a chunking strategy is selected in Settings → Knowledge base, show the
  configuration controls that actually affect *that* strategy.
- Each strategy exposes only its relevant parameters:
  - **Fixed** → chunk size, chunk overlap
  - **Recursive** → chunk size, chunk overlap
  - **Semantic** → similarity threshold, max chunk size
  - **Agentic** → max segments
- The chosen values are threaded through the real re-ingest (chunk → embed → store) and
  through the read-only chunk-preview playground, so the contrast is visible immediately.
- Defaults and valid bounds come from the backend (`/api/config`), so the frontend never
  hardcodes them.
- Bilingual (en + pt) labels and helper text for every new control.

## Non-goals

- No new pipeline `Stage`, `Phase`, station, hop, or tier — this rides the existing
  `rag.ingest.*` ingestion stages and the existing 📚 Knowledge base settings section.
- No persistence of chunking parameters across restarts beyond the existing
  process-local "active strategy" readout (single-instance, §7). The values live with the
  request that triggers the re-ingest; the active index simply reflects the last build.
- No exposure of the agentic LLM prompt/model or semantic sentence-splitter internals
  (deferred — see *Out of scope*).
- No change to how chunks are stored or to the retrieval path.

## User-facing behavior

In **Settings → 📚 Knowledge base**, below the strategy picker, a **"Parameters"** block
renders the controls for the currently-selected strategy:

- **Fixed / Recursive**: a `chunk size` numeric control (characters) and a `chunk overlap`
  numeric control (characters), each with min/max from config and inline helper text.
- **Semantic**: a `similarity threshold` control (0–1) and a `max chunk size` control.
- **Agentic**: a `max segments` control.

The controls are seeded with the backend defaults. Switching strategy swaps the visible
controls (and resets to that strategy's defaults). **"Re-ingest corpus"** sends the chosen
parameters; the canvas animates Chunking → Embedding → Storing with the configured values,
and the `Chunking` stage readout reflects the parameters actually used (e.g. the
`chunk_size`/`chunk_overlap` shown in the Vector DB ingestion detail match what was set).

All labels, helper text, and units ship in **en + pt**.

## Acceptance criteria

1. **AC1** — `GET /api/config` returns a `chunk_params` map describing, per strategy, each
   parameter's `default`, `min`, and `max` (Fixed/Recursive: size+overlap; Semantic:
   threshold+max size; Agentic: max segments).
2. **AC2** — `chunk_texts(text, RECURSIVE)` with the default parameters is **byte-for-byte
   identical** to the current output (regression-pinned), and `chunk_text(text)` is
   unchanged.
3. **AC3** — `chunk_texts(text, FIXED, params=...)` honors a custom `chunk_size` /
   `chunk_overlap`: a smaller size produces strictly more chunks; an out-of-bounds value is
   rejected/clamped per the config bounds.
4. **AC4** — `chunk_texts(text, SEMANTIC, params=...)` honors a custom `semantic_threshold`
   (higher threshold ⇒ more, smaller chunks) and `chunk_size` cap.
5. **AC5** — `chunk_texts(text, AGENTIC, params=...)` caps segments at the supplied
   `max_segments`.
6. **AC6** — `POST /api/rag/reindex` accepts the per-strategy parameters and the
   `rag.ingest.chunk` stage's `data` reports the **parameters actually applied** (e.g.
   `chunk_size`/`chunk_overlap` for fixed/recursive); omitting parameters reproduces 072
   behavior exactly.
7. **AC7** — `POST /api/rag/chunk-preview` accepts the same parameters so the playground
   contrast reflects the chosen values without mutating the index.
8. **AC8** — Invalid/over-bounds parameters yield a 422 (or are clamped to bounds) rather
   than a 500.
9. **AC9** — In Settings → Knowledge base, selecting a strategy renders exactly that
   strategy's relevant controls, seeded from config defaults; the controls' labels and
   helper text exist in both en and pt.
10. **AC10** — Re-ingesting after editing a parameter sends it to the backend; the
    ingestion `Chunking` readout / done summary reflects the configured value.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Parameters are additive `data` keys on the existing
  `rag.ingest.chunk` stage; the reindex/preview requests gain optional fields.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no `Stage`/`Phase`/`TraceEvent` shape
  change; `data` is already an open map).
- Station it maps to in `stations.ts`: existing `rag` (Vector DB) ingestion sub-flow.

## Open questions (clarify before planning)

- [x] Which parameters per strategy? → **Per-strategy, relevant only** (user decision,
  2026-06-19): Fixed/Recursive → size+overlap; Semantic → threshold+max size; Agentic →
  max segments.
- [x] Persist parameters across restarts? → No; process-local active state only (Non-goals).

## Out of scope / deferred

- Exposing the agentic prompt template / model and semantic min-sentence settings
  (the "Full set + advanced" option) — a later spec if there's appetite.
- Persisting the last-used parameters per strategy in `app_config`.
