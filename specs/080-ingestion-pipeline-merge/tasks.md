# Tasks: Ingestion pipeline — merge Object Storage, expose phases

> Ordered TDD checklist. Each implementation task is preceded by the test that
> should fail first (red → green → refactor).

## Backend — split tokenize + metadata into real stages

- [x] **T1 — test first (AC1)**: in `backend/tests/test_ingestion.py`, assert a PDF
  upload emits `storage.upload`, `rag.ingest.chunk`, `rag.ingest.tokenize`,
  `rag.ingest.embed`, `rag.ingest.metadata`, `rag.ingest.store` in order, each
  START+END. (Red — the two new stages don't exist.)
- [x] **T2 — protocol (schemas)**: add `RAG_INGEST_TOKENIZE` + `RAG_INGEST_METADATA`
  to `Stage` in `backend/app/schemas.py` with the ingestion comment block.
- [x] **T3 — implement (AC1)**: rework `ingest_pdf` in `rag/ingestion.py` into the
  six-stage sequence; make T1 green. Apply the same two new stages to
  `reingest_corpus` in `rag/ingest.py`.
- [x] **T4 — test first (AC2)**: assert `rag.ingest.tokenize` END carries a
  per-chunk token list of length == num_chunks and a `total_tokens` metric == sum.
- [x] **T5 — implement (AC2)**: move token counting into the tokenize stage; green.
- [x] **T6 — test first (AC3)**: assert `rag.ingest.metadata` END list length ==
  num_chunks **and** the metadata persisted on the stored Chroma chunks matches.
- [x] **T7 — implement (AC3)**: build metadata in the metadata stage, hand the same
  records to the store step; green.
- [x] **T8 — test (AC4)**: confirm a no-upload chat fires none of
  `storage.upload`/`rag.ingest.*` (extend the existing agent guard test).
- [x] **T8a — test first (AC10)**: in `test_ingestion.py`, assert an upload chunks
  with the active strategy — `fixed` vs `recursive` produce different chunk
  boundaries for the same doc, and `rag.ingest.chunk` END `data.strategy` reports
  the one used. (Red — `ingest_pdf` is hardcoded to recursive.)
- [x] **T8b — implement (AC10)**: swap `chunk_text` → `chunk_texts(text,
  active_chunk_strategy())` in `ingest_pdf`; surface `strategy` in the chunk END;
  green.

## Protocol mirror + visual model merge

- [x] **T9 — protocol mirror (AC5)**: add both new members to the `Stage` union in
  `frontend/src/types/events.ts`.
- [x] **T10 — test first (AC6/AC8)**: update/extend `lib/storage-stages.test.ts` +
  `ingest-stages.test.ts` — `UPLOAD_ONLY_STATIONS === {ingestion}`, no `storage`
  station, all six ingest stages map to `ingestion`, `visibleHopsFor` yields no
  dangling endpoint. (Red.)
- [x] **T11 — implement (AC5/AC6/AC8)**: in `stations.ts` remove the `storage`
  station, fold its blurb/tech/cloud into the `ingestion` "Object store" phase,
  add the four stages to `ingestion.stages`, drop the `backend → storage` hop,
  set `UPLOAD_ONLY_STATIONS`; resolve every resulting `tsc` exhaustive-switch
  error (FlowCanvas `readoutFor`, InspectorPanel `renderDetail`, layout).
- [x] **T12 — phases (AC5)**: assign a `TimelinePhase` to both new stages in
  `phases.ts`; keep `phases.test.ts` parity with `STAGE_TO_STATION` green.

## Drill-in overlay (pure projection)

- [x] **T13 — test first (AC7)**: `lib/ingestionPipeline.test.ts` +
  `IngestionPipelinePanel.test.tsx` — six ordered phases projected from a captured
  upload event log, no network call. (Red.)
- [x] **T14 — implement (AC7)**: add `lib/ingestionPipeline.ts` selectors (mirror
  `lib/ragPipeline.ts`) + `IngestionPipelinePanel.tsx` (mirror `RagPipelinePanel`);
  wire the "Open ingestion pipeline" button on the Ingestion node; green.

## i18n + close-out

- [x] **T15 — i18n (AC9)**: add all new phase labels / drill-in headings / glossary
  entries in en **and** pt (table in `plan.md`).
- [x] **T16 — cloud map**: confirm the Object-store phase carries Blob/S3/Cloud
  Storage names (no station lost a cloud example).
- [x] **T17 — refactor**: clean up, fix any count-based legacy assertions to be
  structural, keep everything green.
- [x] **T18 — demo flag**: per the standing GitHub Pages directive, flag whether
  the 058 upload fixture needs re-capture (new stage shape).

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` clean · `ruff format .`
- [ ] `pytest -q` green (with `OPENAI_API_KEY`)
- [ ] `npm run build` passes (`tsc --noEmit` + build) · `npm test` green
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); every `Stage` mapped to
  exactly one station and one `TimelinePhase`
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
