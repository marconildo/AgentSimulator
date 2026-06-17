# Spec: Intermediate preview tiles (light up the rung's tracks)

| | |
|---|---|
| **ID** | 060-intermediate-preview-tiles |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-16 |
| **Amended** | 2026-06-17 — Hybrid Search reframed as a RAG-pipeline extension (see amendment) |

## Amendment (2026-06-17) — Hybrid Search folded under RAG

Design review feedback: Hybrid Search (BM25 + vector + RRF) is an **enhancement of the
vector RAG retrieval pipeline** — the same category as the reranker (054), which the
project deliberately folded **into** the `rag` station as a query-time sub-stage rather
than a separate node. As a standalone tile floating at the bottom of the data column
(below the LLM), Hybrid read as a *peer* of the LLM/MCP, reinforcing the wrong mental
model. RAGLESS/PageIndex (056) earns its own box because it is a *parallel alternative
paradigm*; Hybrid is not — it augments the same vector store.

**Change (frontend-only, no protocol change):** `hybrid` is reframed as a sub-component
of the RAG pipeline —
- **Layout:** moved in the data column from last (after `llm`) to **immediately below
  the `rag` node**, above MCP/LLM (`layout.ts` `COLUMNS` member order), so it reads as
  an extension of RAG.
- **Label:** subtitle/blurb reworded to make the "extends the RAG retrieval step /
  augments the same vector store" relationship explicit (still bilingual — §4).
- **Unchanged:** it stays a `comingSoon` preview with `tracks: ["rag"]`, so the
  Intermediate track selector still lights up (the chosen trade-off — keep the selector
  rather than let it disappear). `stages: []`, scenarios, and all 059 track invariants
  hold. AC7 below is superseded by the layout note above.

> Give the **Intermediate** rung its first `comingSoon` preview tiles so the
> **059 track selector** becomes meaningful there. Two tiles in two themes:
> **Hybrid Search** (`rag` — a second retriever beside the RAG station) and
> **Summarization** (`agent` — context/memory compaction, the deferred DeepAgents
> piece). Both are non-executing previews (`stages: []`) — they teach the planned
> shape, honour §3 (everything-is-real is about *execution*), and don't fake a run.

## Problem / motivation

After 059, the track selector only appears on a rung that exposes **more than one
theme** with a preview tile. **Intermediate has none** — its only upgrades are
*inside* real nodes (the reranker folded into `rag`, DeepAgents being the real
`agent`), so `tracksForScenario("intermediate")` is empty and the selector stays
hidden. A learner on the Intermediate rung sees no way to browse the RAG-quality
roadmap the rung is supposed to headline.

The honest fix is to add **preview tiles** — the same device the Advanced rung
already uses for its AI-Ops cluster. The roadmap names **Hybrid Search** as the one
retrieval technique that lives *beside* the `rag` station (a second retriever +
fusion), making it the natural first `rag` tile; the other techniques (MMR,
self-query, compression, multi-vector, query expansion) remain planned sub-stages of
the `rag` drill-in and are out of scope here. To make the selector meaningful (it
needs ≥2 themes), we pair it with the rung's natural `agent` preview:
**Summarization** (context compaction), the one DeepAgents pillar 057 explicitly
deferred. Result: Intermediate shows **All · RAG Quality · Agent Design**.

## Goals

- **Two new `comingSoon` preview stations**, `scenarios: ["intermediate","advanced"]`,
  `stages: []`, full bilingual prose + `clouds` map:
  - **`hybrid`** — *Hybrid Search* (BM25 + vector + RRF), tier `services`,
    `tracks: ["rag"]`, beside the RAG station.
  - **`summarization`** — *Summarization* (context compaction), tier `agent`,
    `tracks: ["agent"]`, under the agent.
- **The Intermediate track selector lights up** — `tracksForScenario("intermediate")`
  becomes `["rag","agent"]` (length 2), so the 059 `TrackToggle` renders there and
  narrows the two clusters.
- **The maturity ladder stays cumulative** — `simple ⊆ intermediate ⊆ advanced`;
  Intermediate adds exactly these two tiles over Simple; Advanced remains a superset
  (so it now also lists `rag` among its themes).
- **Simple stays byte-for-byte** — neither tile is on the Simple rung.
- **Layout is collision-free** — `hybrid` stacks in the data column; `summarization`
  sits in the Agent tier **without overlapping the Advanced sub-agent row**; each
  tier box wraps its new member and the boundary recomputes.
- **No protocol change** — no new `Stage`/`Phase`/`TraceEvent`; `STAGE_TO_STATION` /
  `STAGE_TO_PHASE` stay total (the previews carry no stages).
- All new prose **bilingual** (en + pt) — §4; both stations fill
  `clouds.{azure,aws,gcp}` — §5.

## Non-goals

- **Building real retrieval/summarization behavior** — both tiles are previews; their
  execution is each its own future spec (Hybrid search, DeepAgents summarization).
- **The other RAG techniques** (MMR, self-query, contextual compression, multi-vector,
  query expansion) — they remain planned `rag` **sub-stages** of the `rag` drill-in
  per the roadmap, not tiles. Not added here.
- **No new theme** — reuses the 059 `rag` + `agent` tracks; no `Track` value added.
- **No change to the 059 selector rule** (still ">1 theme") or to its safety model
  (a track still hides only `comingSoon` tiles).

## User-facing behavior

On the **Intermediate** rung the canvas gains two clearly-labelled *coming soon*
tiles: **Hybrid Search** in the AI & Data Services tier (just below the data nodes,
beside RAG) and **Summarization** in the Agent tier (under the DeepAgents node).
Because the rung now exposes two themes, the **track switcher appears** in the header
(it was hidden on Intermediate before) offering **All · RAG Quality · Agent Design**:
*RAG Quality* shows Hybrid Search and hides Summarization; *Agent Design* the inverse;
*All* shows both. The Advanced rung — being a superset — also shows both tiles and
gains *RAG Quality* in its own track list. Simple is unchanged. *(All new prose ships
en + pt — §4.)*

## Acceptance criteria

> Frontend Vitest tests (no backend — these are non-executing preview nodes).

1. **AC1 — the two preview stations exist.** `hybrid` and `summarization` are present
   with `comingSoon === true`, `stages === []`, `scenarios` containing
   `intermediate` **and** `advanced`, and `tracks` `["rag"]` / `["agent"]`
   respectively.
2. **AC2 — Intermediate lights up.** `tracksForScenario("intermediate")` equals
   `["rag","agent"]` (length 2 ⇒ the 059 selector renders); `tracksForScenario("simple")`
   stays empty.
3. **AC3 — cumulative ladder.** `visibleStationIdsFor("simple")` excludes both;
   `visibleStationIdsFor("intermediate")` = Simple's set **+** `{hybrid,summarization}`;
   `simple ⊆ intermediate ⊆ advanced` still holds.
4. **AC4 — track clustering on Intermediate.** With `track="rag"`, the intermediate
   visible set contains `hybrid` and not `summarization`; with `track="agent"`, the
   inverse; with `track="all"`, both.
5. **AC5 — Simple byte-for-byte.** For every track, `visibleStationIdsFor("simple",…)`
   is unchanged from today (neither tile appears on Simple).
6. **AC6 — totality intact.** `STAGE_TO_STATION` / `STAGE_TO_PHASE` remain total over
   the unchanged `Stage` enum; no live stage maps to either preview (`stages: []`).
7. **AC7 — layout is collision-free.** In `computeLayout`, on `intermediate` `hybrid`
   is laid out in the data column (its `y` below the last data node) and
   `summarization` in the Agent tier below the agent; on `advanced` `summarization`
   does **not** overlap the sub-agent row (`researcher/coder/critic`); both tier
   boxes wrap their new member.
8. **AC8 — bilingual + cloud map.** Both stations have non-empty `en` and `pt`
   title/subtitle/blurb/generic and a full `clouds.{azure,aws,gcp}` map.

## Protocol / stage impact

§1 & §6.

- New/changed **executing** `Stage`(s): **none** — both tiles are `comingSoon` with
  `stages: []`. `events.ts` untouched; `STAGE_TO_STATION` / `STAGE_TO_PHASE` total.
- **Station model change:** two new `StationId`s (`hybrid`, `summarization`) added to
  the union and to the exhaustive maps/switches (`EXPANDED_H`, `TIER_OF`, layout,
  `readoutFor` → "", `innerRows` → []). `renderDetail` is not exhaustive — previews
  fall through to the existing *coming soon* banner.
- No new tier; reuses `services` + `agent`.

## Open questions (resolved)

- [x] **Scope → minimal (Hybrid + Summarization).** Chosen over a 3-tile RAG cluster
  (Hybrid · Query Expansion · Compression): minimal, honest, and roadmap-consistent
  (Hybrid is the only technique the roadmap already places *beside* `rag`; the rest
  stay as `rag` sub-stages). More `rag` tiles arrive in their own specs.
- [x] **Cumulative ladder kept.** Both tiles are `["intermediate","advanced"]`, so the
  existing `simple ⊆ intermediate ⊆ advanced` invariant (and its test) holds — the
  scenario test's `inter.size === simple.size` assertion is updated to `+2`.

## Out of scope / deferred

- Real Hybrid Search (a second BM25 retriever + RRF fusion, a `rag.hybrid` sub-stage).
- Real DeepAgents summarization middleware (token-threshold context compaction).
- The remaining RAG techniques as `rag` drill-in sub-stages (MMR, self-query,
  compression, multi-vector, query expansion).
- A header redesign if the Advanced rung's 4-theme selector gets tight — handled
  tactically in the plan (verify width; shorten segmented labels only if needed).
