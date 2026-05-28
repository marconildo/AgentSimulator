# Spec: Ingestion / Indexer node (the offline RAG pipeline)

| | |
|---|---|
| **ID** | 033-ingestion-node |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Shipped as **Option A** — a real station that owns the `rag.ingest.*` stages,
> visible in **all** scenarios. See below.

## Problem / motivation

The app teaches the **online** query path (embed → search → retrieve) and even runs a
real ingestion when a user uploads a PDF (`rag.ingest.chunk` → `rag.ingest.embed` →
`rag.ingest.store`). But the **offline** side of RAG — the indexing/ingestion pipeline
that builds the knowledge base in the first place, and the questions that come with it
(**chunking strategy**, **ingestion timing/batching**, **index refresh / re-embedding
when the model changes**) — has no node of its own. Those `rag.ingest.*` stages today
animate the *query-time* RAG node, conflating "build the index" with "search the index."

For someone learning "RAG in production," the offline indexer is as important as the
network topology: a stale or badly-chunked index quietly wrecks answer quality. Since the
ingestion is **already real**, the honest move (constitution §3) is to give it its own
**real** node that lights up when ingestion runs — not a decorative placeholder.

## Goals

- A distinct, **real** **Ingestion / Indexer** station that **owns** the existing
  `rag.ingest.chunk/embed/store` stages (moved off the query-time RAG node), so the
  offline pipeline `docs → chunk → embed → upsert` has its own place and lights up for
  real during an actual ingestion (PDF upload or startup index build).
- It is visible in **all** scenarios (Simple included) — ingestion is real everywhere, so
  the "today's stations" set legitimately grows by one (the guard is updated on purpose).
- Its inspector teaches the production concepts the assessment flagged, using the **real**
  parameters: **chunking** (the actual `CHUNK_SIZE=900` / `CHUNK_OVERLAP=150` characters),
  **trigger/timing** (startup build-if-missing · on PDF upload · rebuild on
  embedding-dimension drift), and **index refresh / staleness**.
- Cloud map filled for the new station (azure/aws/gcp) per §5; all prose bilingual per §4.
- The online query path (embed → search → retrieve on the RAG node) is unchanged.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent` *type* — the `rag.ingest.*` stages already exist;
  this **re-assigns** them from the `rag` station to the new `ingestion` station.
- No new executable behavior: no scheduler, no incremental re-indexing, no corpus
  document-management UI. This surfaces the ingestion that already happens.
- Not changing the online retrieve path, scoring, or the vector store engine.
- No new network hop required (the offline trigger is explained in the inspector); a
  subtle write-path edge is explicitly deferred (see "out of scope").

## User-facing behavior

A new node, **Ingestion / Indexer**, sits in the AI & Data Services column next to the
**RAG · Vector DB** node, in every scenario. Its inspector shows:

- the offline pipeline **chunk → embed → store** (reusing the existing ingestion detail
  view) when an ingestion is in scope;
- the **chunking parameters actually used** (900-character windows, 150-character
  overlap, paragraph-packing);
- the **trigger/timing** (built on startup if the index is missing; on each PDF upload;
  rebuilt when the embedding dimension no longer matches — the app already detects this);
- a short **why it matters** note on index refresh / staleness.

During a real ingestion it animates via the `rag.ingest.*` stages (now owned by this
node). When no ingestion is in scope, it shows its explanatory/idle state. The query-time
RAG node keeps showing query embedding + retrieved chunks only.

All prose in **en + pt**; cloud service examples per provider (proper nouns, not
translated).

## Acceptance criteria

> Mix of pure-projection FE tests and one `[openai]` real-ingestion test.

1. **AC1 — The station exists in the model.** `stations.ts` exposes an `ingestion`
   station with a bilingual `title`/`subtitle`/`blurb`, a filled cloud map
   (azure/aws/gcp non-empty), in the `services` tier, and present in `simple`,
   `intermediate` and `advanced`.
2. **AC2 — It owns the ingest stages; maps stay total.** `STAGE_TO_STATION` maps
   `rag.ingest.chunk`, `rag.ingest.embed`, `rag.ingest.store` to `ingestion` (and **not**
   to `rag`); the `rag` station owns only `rag.embed`/`rag.search`/`rag.retrieve`;
   `STAGE_TO_STATION` and `STAGE_TO_PHASE` remain total over `Stage` and their parity test
   passes.
3. **AC3 — Ingest events light the ingestion node (projection).** Given an event list of
   `rag.ingest.*` start/end pairs, `deriveView` routes them to the `ingestion` station
   (its status reaches `done`, its `events` collected there, `activeStation` is
   `ingestion`) — the previously rag-bound `ingest-stages.test.ts` is updated to assert
   `ingestion`.
4. **AC4 — Real ingestion animates it** `[openai]`. An actual ingestion (PDF upload or
   index build) emits the `rag.ingest.*` stages and the node reflects them — no new
   request, no fakery.
5. **AC5 — Inspector teaches the offline concepts with real values.** The `ingestion`
   case in `renderDetail` shows the chunk→embed→store detail when present, and the
   chunking parameters (900 / 150), trigger/timing and refresh/staleness note (bilingual).
6. **AC6 — Exhaustive switches updated.** `readoutFor` (FlowCanvas) and `renderDetail`
   (InspectorPanel) each gain an `ingestion` case; both switches stay exhaustive over
   `StationId` and `tsc --noEmit` is green.
7. **AC7 — Simple-scenario guard updated intentionally.** `visibleStationIdsFor("simple")`
   now equals today's seven **plus** `ingestion`; the `scenario.test.ts` `TODAY_STATIONS`
   constant is updated to match, and the cumulative-ladder test (simple ⊂ intermediate ⊂
   advanced) still holds.
8. **AC8 — Online path unchanged.** The query-time RAG node still shows embedding +
   retrieved chunks; retrieval tests are unaffected; layout reflows to fit the new node
   in the services column without overlapping its neighbours.
9. **AC9 — Bilingual + cloud completeness (§4, §5).** New strings have en/pt parity
   (non-empty); the cloud map has azure/aws/gcp.

## Protocol / stage impact

- New/changed `Stage`(s): **none new**. The `rag.ingest.*` stages are **re-assigned** from
  the `rag` station to a new `ingestion` station (a §6 visual-model change).
- Mirror in `frontend/src/types/events.ts`: **n/a** (no `Stage` type change).
- Station in `stations.ts`: **new `ingestion` station** (services tier), owning the three
  ingest stages. `STAGE_TO_STATION` auto-updates; `STAGE_TO_PHASE` is unchanged (the
  stages keep their `retrieve` phase — phase is independent of station). `readoutFor` and
  `renderDetail` gain an `ingestion` case; the rag case loses the ingestion branch.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Real station owning the ingest stages, or preview node?** → **Option A**: a real
  station owns `rag.ingest.*` (re-mapped from `rag`). Ingestion is real, so the node is
  real — not a `comingSoon` placeholder.
- [x] **Which scenario(s)?** → **All** (Simple included). Ingestion happens in every
  scenario; the today's-stations guard is updated on purpose (AC7).
- [x] **Layout + own hop?** → Place in the **services column right after the RAG node**;
  the services tier box auto-grows from the stacked members. **No new hop** — the offline
  trigger is explained in the inspector (a write-path edge is deferred).
- [x] **Chunking parameters** → Surface the **real** values from `rag/ingest.py`
  (`CHUNK_SIZE=900`, `CHUNK_OVERLAP=150` characters, paragraph-packing) so the inspector
  is truthful.

## Out of scope / deferred

- A real ingestion **scheduler** / cron and incremental re-indexing.
- Corpus document management UI; per-document ingestion history.
- A dashed **write-path edge** (backend → ingestion → vector store) — a nice clarity
  touch, deferred to keep this change's layout churn small; revisit if the offline trigger
  reads as disconnected.
