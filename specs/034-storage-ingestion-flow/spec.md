# Spec: Storage → Ingestion write-path (the upload pipeline)

| | |
|---|---|
| **ID** | 034-storage-ingestion-flow |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Status: **done** (full TDD; backend 138 pytest pass, frontend 294 Vitest pass,
> `tsc`/`vite build` green). Resolved (clarify): **real** object store (not a
> preview), wired in **all** scenarios. This picks up the write-path edge that
> spec 033 explicitly deferred ("revisit if the offline trigger reads as
> disconnected") and extends it with a real Storage station. The HOW is in `plan.md`.
>
> **Amendment (post-review, 2026-05-27):** the indexer is invoked by the **Backend**,
> not the storage. Topology corrected from `storage → ingestion` to `backend → ingestion`
> (the API persists the file, then calls the indexer — matching the real `main.py` flow:
> `put_object` → `ingest_uploaded`). The storage↔ingestion leg now animates through the
> backend hub.

## Problem / motivation

Spec 033 gave the offline indexer its own **Ingestion / Indexer** node, but left it
**visually orphaned**: no network hop connects it to anything, so on the canvas it just
floats in the data tier. 033's own "out of scope" note flagged this and said to revisit
"if the offline trigger reads as disconnected" — it does.

Worse, the real upload flow today skips a step every production RAG pipeline has:
**durable object storage**. When a user uploads a PDF, the bytes go straight from the
HTTP request into chunk → embed → store; the raw document is never persisted anywhere.
Real systems upload the file to object storage (S3 / Blob / Cloud Storage) **first**,
which decouples "the file is safely received" from "the file has been indexed," lets
ingestion be retried/reprocessed, and keeps the original for re-chunking when the
embedding model changes.

The visualizer should teach this honest write-path: **Frontend → Backend → upload to
Storage → Ingestion → Vector DB (persist)** — and, per constitution §3, the Storage step
must be **real** (a genuine object write the ingestion actually reads from), not a
decorative placeholder.

## Goals

- A new, **real** **Object Storage** station in the data tier, holding uploaded documents
  durably before they are indexed.
- The upload pipeline is **wired as real network hops** so nothing floats — the **Backend
  orchestrates**: `backend → storage` (object PUT), then `backend → ingestion` (the API
  calls the indexer with the object key after the write), and `ingestion → rag` (upsert
  vectors). The Ingestion node is no longer hop-less. (The "indexer reads the stored
  object" step is folded into the `backend → ingestion` detail; storage↔ingestion is not a
  direct edge — that leg animates through the backend hub.)
- The Storage step **executes for real**: on PDF upload the backend writes the bytes to a
  real object store (a local filesystem stand-in for Blob/S3, exactly as SQLite stands in
  for managed SQL today) and the ingestion **reads the document back from storage** — so
  the step is load-bearing, not cosmetic.
- Visible in **all** scenarios (Simple included), matching where the Ingestion node lives.
- The query/read path is untouched: a normal chat still runs `agent → rag` and emits no
  storage event; the storage node stays idle.
- Deleting a document and "Clear databases" (025) also remove the stored objects.
- Cloud map filled for the new station (azure/aws/gcp) per §5; all new prose bilingual
  (en + pt) per §4.

## Non-goals

- No upload **scheduler**, event-bus, queue, or async out-of-band ingestion worker — the
  Backend calls the indexer inline within the upload request (`backend → ingestion`); it
  does not introduce a real message broker or storage-event subscription.
- No versioning, lifecycle policies, signed-URL issuance, or multi-bucket management — one
  flat object store keyed by `session/document/filename`.
- No change to the **online** query path (embed → search → retrieve), scoring, or the
  vector-store engine.
- No new corpus-document-management UI beyond what 002 already provides.

## User-facing behavior

A new node, **Object Storage**, appears in the AI & Data Services column, in every
scenario. The canvas now draws the full write-path as connected edges:

```
Frontend ──HTTPS──▶ Backend ──PUT object──▶ Object Storage ──read──▶ Ingestion ──upsert──▶ RAG · Vector DB
```

When a user uploads a PDF, the animation flows along this path: the request reaches the
Backend, the Backend writes the file to Object Storage (a real write — a new
`storage.upload` step lights the node), then the Ingestion node runs chunk → embed → store
reading the document **from storage**, and finally upserts the vectors into the Vector DB.

The Object Storage inspector shows the **real** stored object (its storage key / URI,
size, content type) when an upload is in scope, plus a bilingual "why object storage" note
(durability, decoupling upload from indexing, keeping the original for re-chunking) and
the per-cloud service examples. When idle it shows its explanatory state.

A normal chat message is unchanged: no `storage.upload` event, the storage node stays
idle, and the existing `agent → rag` query edge animates as before.

All prose in **en + pt**; cloud service examples per provider (proper nouns, not
translated).

## Acceptance criteria

> Mix of pure-projection FE tests, keyless backend tests (the object store is plain
> filesystem I/O), and one `[openai]` real-upload test.

1. **AC1 — The station exists in the model.** `stations.ts` exposes a `storage` station
   with bilingual `title`/`subtitle`/`blurb`, a filled cloud map (azure/aws/gcp non-empty),
   in the `services` tier, and present in `simple`, `intermediate` and `advanced`.
2. **AC2 — New `Stage`, mirrored, maps stay total.** `Stage` gains `STORAGE_UPLOAD =
   "storage.upload"` in `schemas.py`, mirrored in `events.ts`. `STAGE_TO_STATION` maps
   `storage.upload` to `storage` (and only there); `STAGE_TO_PHASE` assigns it a phase;
   both maps remain total over `Stage` and their parity test passes.
3. **AC3 — The object store really round-trips (keyless).** Writing an object persists a
   real file under the configured storage path; reading it returns byte-identical content;
   deleting it removes the file. Runs without an API key.
4. **AC4 — Upload writes to storage, then ingests from it** `[openai]`. Uploading a PDF
   emits, in order, `frontend → backend → storage.upload → rag.ingest.chunk →
   rag.ingest.embed → rag.ingest.store`; after the run the object exists in storage and the
   vectors exist in Chroma; the ingestion reads the document **from storage** (the step is
   load-bearing — remove the stored object and ingestion has nothing to read).
5. **AC5 — Projection lights the whole flow.** Given an upload event list, `deriveView`
   marks the `storage` station `done` and `activeStation` reaches `storage` at the
   `storage.upload` event, then continues to `ingestion`; the write-path is animated, not
   floating.
6. **AC6 — The hops exist and wire the flow.** `HOPS_SRC` contains `backend→storage`,
   `backend→ingestion`, and `ingestion→rag`, each with bilingual `label`/`protocol`/
   `detail`/`controls` and `zone: "private"`; `HOP_PAIRS` includes all three. The
   `ingestion` station now has at least one incoming (`backend→ingestion`) and one outgoing
   (`ingestion→rag`) hop (no longer hop-less).
7. **AC7 — Inspector + readout teach storage; switches stay exhaustive.** `renderDetail`
   gains a `storage` case showing the stored object (key/URI, size, content type) when
   present plus a bilingual "why object storage" note and cloud examples; `readoutFor`
   gains a compact `storage` case; both switches stay exhaustive over `StationId` and
   `tsc --noEmit` is green.
8. **AC8 — Simple-scenario guard updated intentionally.** `visibleStationIdsFor("simple")`
   equals today's set **plus** `storage`; `scenario.test.ts`'s `TODAY_STATIONS` is updated
   to match; the cumulative-ladder invariant (simple ⊂ intermediate ⊂ advanced) still holds.
9. **AC9 — Delete + clear remove stored objects.** Deleting a document removes its stored
   object (as well as its vectors and relational row); "Clear databases" (025) also wipes
   all stored objects and reports the count alongside the existing tallies.
10. **AC10 — Chat path unchanged (regression guard).** A normal chat message emits **no**
    `storage.upload` event, leaves the `storage` node idle, and the `agent → rag` query
    path and its tests are unaffected — omitting an upload reproduces today's behavior.
11. **AC11 — Bilingual + cloud completeness (§4, §5).** Every new string has en/pt parity
    (non-empty); the new station's cloud map has azure/aws/gcp.

## Protocol / stage impact

- New/changed `Stage`(s): **`STORAGE_UPLOAD = "storage.upload"`** (new) — added in
  `backend/app/schemas.py` and mirrored in `frontend/src/types/events.ts` (§1).
- Emitted in: the PDF-upload endpoint, between `BACKEND` (received) and the `rag.ingest.*`
  stages (the indexer then reads the stored object).
- Station it maps to in `stations.ts`: **new `storage` station** (services tier), owning
  `storage.upload`. `STAGE_TO_STATION` auto-derives. `STAGE_TO_PHASE` gets a new entry.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel): a `storage` `case` added to
  each (both switches stay exhaustive over `StationId`).

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Real storage, or visual preview?** → **Real.** The backend writes uploaded bytes
  to a genuine object store (filesystem stand-in for Blob/S3) and ingestion reads them
  back, honoring §3 (everything-is-real is about *execution*).
- [x] **Which scenario(s)?** → **All** (Simple included), matching the Ingestion node added
  in 033; `TODAY_STATIONS` is updated on purpose (AC8).
- [x] **Timeline phase for `storage.upload`?** → **`persist`** — it persists the raw file
  to durable storage. (Decided in plan; alternative `retrieve` noted there.)
- [x] **Does ingestion read from storage, or just from the request bytes?** → **From
  storage**, so the new step is load-bearing rather than decorative.

## Out of scope / deferred

- A real async ingestion worker / queue / event subscription (the Backend calls the
  indexer inline via `backend → ingestion`; ingestion still runs in-request).
- Object versioning, lifecycle/TTL policies, signed download URLs, multi-bucket layout.
- A dedicated **Learn** topic for object storage — nice to add, deferred to a Learn-content
  pass (023/024 style) to keep this change focused.
