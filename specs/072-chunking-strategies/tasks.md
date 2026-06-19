# Tasks: Chunking strategies (configurable, visual, ingestion-time)

> TDD checklist — red → green → refactor. Order: extract strategy module (keep default
> byte-for-byte) → new strategies → config/ingest → playground endpoint → re-ingest flow →
> frontend playground + Settings → i18n.

## Tasks

- [ ] **T1 — test first**: `test_chunking.py` — `recursive` strategy output == today's `chunk_text`
  for every corpus file (AC1).
- [ ] **T2 — implement**: create `backend/app/rag/chunking.py`; move `chunk_text` → `_recursive`;
  re-export for back-compat. Make T1 green (pure refactor, no behavior change).
- [ ] **T3 — test first**: structural properties of `fixed` (length windows, may cut mid-sentence)
  and `recursive` (no mid-word start) (AC2).
- [ ] **T4 — implement**: `_fixed` splitter + the `chunk(text, strategy)` interface. Make T3 green.
- [ ] **T5 — test first**: `semantic` places a boundary at a topic shift (`@openai`/embeddings);
  `agentic` returns ≥1 non-empty segment (`@openai`) (AC2).
- [ ] **T6 — implement**: `_semantic` (sentence embeddings + similarity-drop boundary) and `_agentic`
  (LLM segmentation + validate/repair, fall back to recursive on malformed). Make T5 green.
- [ ] **T7 — test first**: `chunk_strategy` config + `build_index(strategy)` tags chunks + count
  differs fixed vs recursive (AC3).
- [ ] **T8 — implement**: add `chunk_strategy` to `config.py`; thread `strategy` through
  `build_index`/`load_corpus`; tag chunk metadata. Make T7 green.
- [ ] **T9 — test first**: `POST /api/rag/chunk-preview` read-only, `all` → 4 strategies, fixed≠
  recursive, no index mutation (AC4).
- [ ] **T10 — implement**: the chunk-preview endpoint. Make T9 green.
- [ ] **T11 — test first**: re-ingest emits `rag.ingest.chunk/embed/store` in order + index strategy
  metadata updates (AC5).
- [ ] **T12 — implement**: traced re-ingest action streaming the aggregated ingestion stages. Make
  T11 green.
- [ ] **T13 — test first**: `/api/config` reports active strategy + list (AC8).
- [ ] **T14 — implement**: extend `/api/config`. Make T13 green.
- [ ] **T15 — test first**: `RagStageDetail.chunking.test.tsx` — playground compare render (chosen vs
  fixed, mid-sentence flag) (AC7).
- [ ] **T16 — implement**: Chunking playground UI + carry `strategy` in `ragPipeline`; Settings →
  Knowledge base picker + Re-ingest (animates canvas). Make T15 green.
- [ ] **T17 — i18n**: Settings + playground + 4 chunking glossary strings in en + pt (AC9); parity green.
- [ ] **T18 — refactor**: tidy, confirm AC6 (no new `Stage`, mappings unchanged), all tests green.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; `@openai` strategies skipped without)
- [ ] `npm run build` + `npm test` green
- [ ] No new `Stage`/station; ingestion stages + Chunking card reused; `events.ts` mirror in sync
- [ ] All new user-facing text in en **and** pt
- [ ] GitHub Pages demo (058): re-ingest animates live; if the demo should show the chunking
  playground, capture a `chunk-preview` fixture (standing demo directive) — log if deferred
- [ ] `spec.md` status → `done`
