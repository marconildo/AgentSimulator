# Tasks: Storage → Ingestion write-path (the upload pipeline)

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives
> it (red → green → refactor). Check boxes as you go and move `spec.md` status along.

## Protocol + model (the contract first)

- [x] **T1 — test (red)**: stage→station + phase parity. Add a test asserting
  `STAGE_TO_STATION["storage.upload"] === "storage"` and extend `phases.test.ts` to expect
  `storage.upload` in `STAGE_TO_PHASE` (AC2). Fails — `storage.upload` doesn't exist yet.
- [x] **T2 — impl**: add `STORAGE_UPLOAD = "storage.upload"` to `Stage` in `schemas.py`
  **and** mirror `"storage.upload"` in `frontend/src/types/events.ts` (§1). Add
  `"storage.upload": "persist"` to `STAGE_TO_PHASE`. (T1 still red until the station exists.)

## The object store (real, keyless)

- [x] **T3 — test (red)**: `backend/tests/test_object_store.py` — `put_object` writes a real
  file under a temp `storage_path`; `get_object` returns byte-identical content;
  `delete_object` / `delete_session_objects` / `clear_objects` remove files and return
  counts (AC3). Keyless.
- [x] **T4 — impl**: `backend/app/config.py` add `storage_dir` + `storage_path`;
  `backend/app/storage/object_store.py` implement put/get/delete/clear; point
  `conftest.py` at a throwaway temp dir; add the volume to `docker-compose.yml`.

## Station + hops + layout (the canvas)

- [x] **T5 — test (red)**: `stations.test.ts` — `storage` station exists with bilingual
  fields, cloud map (azure/aws/gcp non-empty), `services` tier, all scenarios; the three
  hops (`backend→storage`, `storage→ingestion`, `ingestion→rag`) exist with bilingual
  label/protocol/detail/controls + `zone:"private"`; `ingestion` is no longer hop-less
  (AC1, AC6, AC11). `layout.test.ts` — storage placed in the data column, tier box grows, no
  overlap (AC7). Fails.
- [x] **T6 — impl**: add `storage` to the `StationId` union + `STATIONS_SRC` (with cloud
  map); add the three hops to `HOPS_SRC`; `layout.ts` add `storage` to `EXPANDED_H`, the
  data column `members` (above `ingestion`) and `TIER_OF`; tune edge handles. Makes T5 (and
  T1) green.

## Projection (pure)

- [x] **T7 — test (red)**: given an upload event list (`frontend → backend →
  storage.upload → rag.ingest.*`), `deriveView` marks `storage` `done`, `activeStation`
  reaches `storage` at `storage.upload`, then `ingestion` (AC5). Also assert a normal chat
  event list leaves `storage` idle and emits no `storage.upload` (AC10). Fails.
- [x] **T8 — impl**: no projection code change expected (auto-derived from `stages`);
  if a tweak is needed, make it minimal. Make T7 green.

## Inspector + readout (exhaustive switches)

- [x] **T9 — test (red)**: `renderDetail` `storage` case renders the stored-object info +
  bilingual "why object storage" + cloud examples; `readoutFor` `storage` case compact;
  both switches exhaustive (`tsc --noEmit` would fail without the cases) (AC7). Fails.
- [x] **T10 — impl**: add the `storage` `case` to `readoutFor` (FlowCanvas) and
  `renderDetail` (InspectorPanel); add the i18n labels to `strings.ts` (en + pt). Green.

## Scenario guard

- [x] **T11 — test (red)**: `scenario.test.ts` — `TODAY_STATIONS` includes `storage`;
  `visibleStationIdsFor("simple")` equals it; ladder still cumulative (AC8). Fails.
- [x] **T12 — impl**: update `TODAY_STATIONS` to include `storage`. Green.

## Backend wiring (real upload → storage → ingest)

- [x] **T13 — test (red)**: `[openai]` upload test — uploading a PDF emits stages in order
  `frontend → backend → storage.upload → rag.ingest.chunk → embed → store`; the object
  exists in storage after; ingestion reads its bytes from storage (remove the object ⇒
  ingestion has nothing to read); vectors exist in Chroma (AC4). Fails.
- [x] **T14 — impl**: `main.py` upload endpoint emits the `STORAGE_UPLOAD` stage
  (`put_object`, record key/uri/size/content-type) and passes the storage key to
  `ingest_pdf`; `ingest_pdf` reads from storage. Green.

## Delete + clear remove objects

- [x] **T15 — test (red)**: deleting a document removes its stored object; "Clear
  databases" (025) removes all stored objects and reports `objects_deleted` (AC9). Fails.
- [x] **T16 — impl**: `delete_document` calls `delete_object`; the clear endpoint calls
  `clear_objects()` and adds `objects_deleted` to its response. Green.

## Refactor + gates

- [x] **T17 — refactor**: tidy edge handles/labels, dedupe, keep all tests green.
- [x] **T18 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (with `OPENAI_API_KEY`)
  · `npm run build` · `npm test`; verify protocol mirror in sync, every `Stage` mapped to a
  station + a phase, all new text en + pt, cloud map filled. Move `spec.md` → `done`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `pytest -q` green (with `OPENAI_API_KEY`; keyless object-store
  test runs without one)
- [x] `npm run build` passes (`tsc --noEmit` + build) · `npm test` green
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); every `Stage` mapped to a
  station (`STAGE_TO_STATION`) and a phase (`STAGE_TO_PHASE`)
- [x] All new user-facing text exists in en **and** pt; new station cloud map filled
  (azure/aws/gcp)
- [x] `storage_path` mounted as a volume (compose) and pointed at a temp dir in tests
- [x] `spec.md` status updated to `done`
