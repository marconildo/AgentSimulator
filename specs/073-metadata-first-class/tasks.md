# Tasks: Metadata as a first-class citizen

> TDD checklist — red → green → refactor. Order: ingest extraction → carry to chunk dicts →
> filterable retrieve → frontend chips + filter → i18n. Depends on 072's re-ingest path.

## Tasks

- [ ] **T1 — test first**: `test_metadata.py` — ingest extracts `section` (nearest heading),
  `doc_type`, `position` (`{index,total}`), frontmatter for a known corpus file (AC1).
- [ ] **T2 — implement**: enrich `Document.metadata` in `ingest.py`/`chunking.py`. Make T1 green.
- [ ] **T3 — test first**: `_to_chunk` / `_all_scoped_chunks` carry the new metadata into the chunk
  dict (AC2, backend half).
- [ ] **T4 — implement**: thread metadata through `retriever.py` chunk dicts. Make T3 green.
- [ ] **T5 — test first**: `retrieve(filters=…)` → Chroma `where=` restricts to one source and
  composes with `_scope_filter`; no-filter byte-for-byte (AC3, AC4). `@openai` for the live run.
- [ ] **T6 — implement**: `_with_filters(scope, filters)` helper + `filters` arg on `retrieve`. Make
  T5 green.
- [ ] **T7 — test first**: legacy metadata-poor chunk still retrieves + projects without crashing
  (AC5, backend).
- [ ] **T8 — implement**: defensive `.get(...)` defaults across the chunk path. Make T7 green.
- [ ] **T9 — test first**: `ragPipeline.metadata.test.ts` — metadata flows onto `PipelineChunk`,
  degrades when absent (AC2/AC5 frontend).
- [ ] **T10 — implement**: extend `PipelineChunk` + `events.ts` chunk type; carry in projection.
  Make T9 green.
- [ ] **T11 — test first**: `RagStageDetail.metadata.test.tsx` — chip row renders for a rich chunk,
  degrades for a poor one (AC6).
- [ ] **T12 — implement**: metadata chip row + "why retrieved" in RagStageDetail + Vector DB
  inspector. Make T11 green.
- [ ] **T13 — test first**: manual filter round-trip (backend filter + frontend wiring) (AC7).
- [ ] **T14 — implement**: minimal filter control + api wiring (optional `retrieval_filters` request
  input, default none). Make T13 green.
- [ ] **T15 — i18n**: chip/filter/why-retrieved strings + 2 glossary entries (+ self-query forward
  note) in en + pt (AC9); parity green.
- [ ] **T16 — refactor**: tidy, confirm AC8 (no new `Stage`, mappings unchanged), all tests green.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; `@openai` tests skipped without)
- [ ] `npm run build` + `npm test` green
- [ ] No new `Stage`/station; metadata additive on chunk dicts; `events.ts` mirror in sync
- [ ] All new user-facing text in en **and** pt
- [ ] Re-ingest (072 path) populates metadata; legacy index degrades gracefully
- [ ] GitHub Pages demo (058): consider re-capturing a fixture so chips show in the mocked demo
  (standing demo directive) — log if deferred
- [ ] `spec.md` status → `done`
