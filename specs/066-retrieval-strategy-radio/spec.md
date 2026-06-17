# Spec: Retrieval strategy is a radio (Vector RAG ⊻ RAGLESS)

| | |
|---|---|
| **ID** | 066-retrieval-strategy-radio |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

Today the "Build" popover lets the user enable **Vector RAG** and **RAGLESS / PageIndex**
*at the same time* (Vector RAG is even a locked, always-on component). When both are on,
the backend deliberately runs **both** retrieval paths (056): the vector pipeline runs and
animates for display, while PageIndex actually grounds the answer. The persisted message
chunks come from the `rag.retrieve` event (`main.py:_retrieved_chunks`), so the **"Sources
used"** panel shows scored `rag.md` hits even though the model answered from PageIndex.

The result is a confusing, dishonest reading: RAGLESS is on, the answer is grounded by
PageIndex, but the UI lists vector similarity hits as the sources — making it look like
RAGLESS was ignored. Vector RAG and reasoning-based retrieval are *alternative* grounding
strategies; presenting them as independently-checkable boxes invites exactly this mix-up,
unlike the agent **runtime**, which is honestly modelled as a radio (pick exactly one).

## Goals

- Model retrieval as a single **strategy radio** — exactly one of **Vector RAG** or
  **RAGLESS / PageIndex** is active at any time (mirrors the runtime radio).
- When **RAGLESS** is the active strategy, the **vector pipeline does not run at all** — no
  `rag.*` stages fire, and the "Sources used" panel reflects the PageIndex-selected sections,
  never vector hits.
- When **Vector RAG** is the active strategy, behavior is **byte-for-byte today's default**
  (the `pageindex.*` path never runs).
- Reranker and Hybrid search (which only make sense over the vector index) are selectable
  **only while Vector RAG is the active strategy**; switching to RAGLESS disables them.
- The derived maturity badge keeps working (RAGLESS still floors at Intermediate).

## Non-goals

- A "no retrieval / ungrounded" strategy. Whether the agent retrieves at all is a separate
  axis (disabling the `search_knowledge_base` tool); this spec only changes *how* it
  retrieves. Retrieval is always present (one of the two strategies), as it is today.
- Any change to the PageIndex algorithm, the reranker, or hybrid search themselves.
- Adding a new `Stage`, station, hop, or tier. (No protocol change — see below.)
- Composing RAGLESS with DeepAgents differently than today (precedence rules unchanged).

## User-facing behavior

- In the **Build** popover, the "Retrieval & Data" group leads with a **Retrieval strategy**
  radio: **Vector RAG** (default) ⊻ **RAGLESS / PageIndex**. Picking one deselects the other.
- **Reranker** and **Hybrid search** sit under the radio; they are enabled only when
  **Vector RAG** is selected, and shown dimmed with a "requires Vector RAG" tooltip while
  RAGLESS is active. Switching to RAGLESS turns Reranker off.
- On the canvas: selecting **Vector RAG** shows the **RAG (Vector DB)** station and hides
  **RAGLESS**; selecting **RAGLESS** shows the **RAGLESS** station and hides **RAG**.
- After a run with **RAGLESS** active, the chat bubble's **"Sources used"** lists the
  PageIndex-selected sections (no `rag.md` similarity scores from a vector search that
  didn't happen).
- All new/changed prose ships in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1 (mutual exclusion)** — Given the selection store, when the retrieval strategy is set
   to `ragless`, then `vector` is not active, and vice versa; exactly one is always active.
2. **AC2 (default unchanged)** — Given a fresh/default selection, the active strategy is
   `vector`, the resolved stations include `rag` and exclude `pageindex`, and
   `currentRequestInputs()` yields `{ ragless: false, … }` — identical to today.
3. **AC3 (request inputs)** — Given strategy `ragless`, `requestInputs` yields `ragless: true`
   and `rerank: false` (rerank cannot ride a non-vector strategy); given strategy `vector`
   with rerank enabled, it yields `{ ragless: false, rerank: true }`.
4. **AC4 (station visibility)** — Given strategy `ragless`, `resolveStations` includes
   `pageindex` and excludes `rag`; given `vector`, it includes `rag` and excludes `pageindex`.
5. **AC5 (rerank/hybrid gated on vector)** — Given strategy `ragless`, `canToggle("rerank")`
   and `canToggle("hybrid")` are false; switching to `ragless` while `rerank` is enabled
   clears `rerank` from the enabled set.
6. **AC6 (backend skips vector under RAGLESS)** — Given `ragless=True`, when the agent runs
   its retrieval, then **no `rag.*` stages are emitted** (`rag.search`/`rag.retrieve`/`rag.embed`
   absent) and the `pageindex.*` stages fire and ground the answer.
7. **AC7 (backend default unchanged)** — Given `ragless=False`, no `pageindex.*` stage is
   emitted and the vector path runs exactly as today (regression guard, byte-for-byte).
8. **AC8 (honest sources)** — Given a turn run with `ragless=True`, the chunks persisted with
   the message (and shown in "Sources used") are the PageIndex-selected sections, not vector
   chunks (`_retrieved_chunks` falls back to `pageindex.select` when no `rag.retrieve` exists).

## Protocol / stage impact

- New/changed `Stage`(s): **none**. This re-routes *which* existing stages fire (`rag.*` vs
  `pageindex.*`); it neither adds nor removes a `Stage`/`Phase`/`TraceEvent`.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no protocol change).
- Station it maps to in `stations.ts`: **n/a** (existing `rag` + `pageindex` stations; only
  their *visibility selection* changes, via `selection.ts`).

## Open questions (clarify before planning)

_All resolved (user decisions, 2026-06-17):_

- [x] Mechanism: a **retrieval-strategy radio** (Vector RAG ⊻ RAGLESS), not auto-unchecking
      checkboxes — mirrors the runtime radio.
- [x] Backend when RAGLESS active: **skip the vector pipeline entirely** (don't run it for
      display), so "Sources used" reflects only PageIndex.

## Out of scope / deferred

- A true "ungrounded / no retrieval" option in the builder (separate axis: tool toggle).
- Showing a *side-by-side* vector-vs-PageIndex comparison view (the 056 rationale for running
  both is dropped here in favour of an honest single-strategy run).
- Making `ChatChunk.score` richer for PageIndex (a relevance signal from navigation); for now
  PageIndex sections render without a similarity score.
