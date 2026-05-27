# Tasks: Ingestion / Indexer node (the offline RAG pipeline)

> Option A. Ordered TDD checklist (red → green → refactor). Two existing tests
> (`ingest-stages`, `scenario`) intentionally change — update them as the spec dictates.

## Tasks

- [x] **T1 — test first (AC2)**: update `ingest-stages.test.ts` to expect
  `STAGE_TO_STATION[rag.ingest.*] === "ingestion"`; add an assertion that `rag` owns only
  `rag.embed`/`rag.search`/`rag.retrieve`. (Red — still maps to `rag`.)
- [x] **T2 — implement (model)**: add `"ingestion"` to `StationId`; add the `ingestion`
  `StationSrc` (services tier, bilingual fields, cloud map, the three ingest stages);
  remove those stages from `rag`. (Green T1.)
- [x] **T3 — test first (AC3)**: in `ingest-stages.test.ts`, assert `deriveView` routes
  ingest start/end events to `ingestion` (status `done`, `activeStation === "ingestion"`).
- [x] **T4 — implement**: nothing beyond T2 if projection auto-derives — confirm green;
  adjust if the rag/ingestion split needs help. (Green T3.)
- [x] **T5 — test first (AC1/AC9)**: `stations.test.ts` — ingestion has non-empty
  title/subtitle/blurb in en & pt, a filled cloud map (azure/aws/gcp), and is in all three
  scenarios.
- [x] **T6 — implement (i18n + cloud)**: author the bilingual fields + cloud map. (Green.)
- [x] **T7 — test first (AC2 parity)**: `phases.test.ts` — `STAGE_TO_PHASE` /
  `STAGE_TO_STATION` parity still holds (ingest stages present in both, `retrieve` phase).
- [x] **T8 — implement**: no `phases.ts` change expected; confirm green. (Green T7.)
- [x] **T9 — test first (AC7)**: `scenario.test.ts` — `TODAY_STATIONS` includes
  `ingestion`; cumulative ladder simple ⊂ intermediate ⊂ advanced still passes.
- [x] **T10 — implement**: update `TODAY_STATIONS`. (Green T9.)
- [x] **T11 — implement (AC6 render)**: add `case "ingestion":` to `renderDetail`
  (IngestionDetail + chunking/trigger/refresh Section) and to `readoutFor`; remove the
  ingestion branch from the rag case; keep both switches exhaustive.
- [x] **T12 — implement (layout, AC8)**: add `ingestion: "services"` to `COLUMN_OF`, order
  after `rag`; verify the tier box + boundary reflow without overlap (extend
  `layout.test.ts` if it asserts positions).
- [x] **T13 — (optional) backend**: expose `CHUNK_SIZE`/`CHUNK_OVERLAP` via `/api/config`
  so the inspector reads true values; else comment-link `rag/ingest.py`.
- [x] **T14 — test (AC4)** `[openai]`: a real ingestion emits `rag.ingest.*` and the node
  reflects them (backend ingestion test + derive check).
- [x] **T15 — refactor**: tidy the rag/ingestion split; ensure PDF-upload UX points the
  inspector at the ingestion node.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`)
- [ ] `npm run build` (`tsc --noEmit` + build) and `npm test` green
- [ ] `STAGE_TO_STATION` / `STAGE_TO_PHASE` total; parity tests pass; both switches exhaustive
- [ ] All new user-facing text in en **and** pt; cloud map azure/aws/gcp filled
- [ ] `ingest-stages.test.ts` + `scenario.test.ts` updated intentionally and green
- [ ] `spec.md` status updated to `done`
