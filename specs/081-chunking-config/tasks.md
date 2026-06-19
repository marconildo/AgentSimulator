# Tasks: Per-strategy chunking configuration

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives
> it (red → green → refactor). Check boxes as you go.

## Backend — chunking core

- [x] **T1 — test first**: `test_chunking.py` — recursive default output == current snapshot
  and `chunk_text(text)` unchanged (AC2, regression pin).
- [x] **T2 — implement**: add `ChunkParams` dataclass + `CHUNK_PARAM_BOUNDS` (defaults from
  the existing constants); thread optional `params` through the four cores + `chunk`/
  `chunk_texts`, defaulting to the constants. Make T1 green.
- [x] **T3 — test first**: fixed honors custom `chunk_size`/`chunk_overlap` — smaller size ⇒
  strictly more chunks; bounds enforced (AC3, AC8).
- [x] **T4 — implement**: wire fixed params; clamp/validate per `CHUNK_PARAM_BOUNDS`.
- [x] **T5 — test first** (`@pytest.mark.openai`): semantic honors `semantic_threshold` +
  size cap (AC4); agentic caps at `max_segments` (AC5).
- [x] **T6 — implement**: wire semantic + agentic params.

## Backend — ingestion + API

- [x] **T7 — test first**: `test_reindex.py` — reindex with params reports applied
  `chunk_size`/`chunk_overlap` in `rag.ingest.chunk` data; omitting params == 072 behavior
  (AC6); over-bounds ⇒ 422 (AC8).
- [x] **T8 — implement**: thread `params` through `load_corpus`/`build_index`/
  `reingest_corpus`; emit applied params; extend `ChunkPreviewRequest`; validate + build
  `ChunkParams` in `reindex_corpus`.
- [x] **T9 — test first**: `test_chunk_preview.py` — preview accepts params (AC7).
- [x] **T10 — implement**: forward params in `chunk_preview`.
- [x] **T11 — test first**: `/api/config` includes `chunk_params` (default/min/max per
  strategy) (AC1).
- [x] **T12 — implement**: add `chunk_params` to `/api/config` from `CHUNK_PARAM_BOUNDS`.

## Frontend

- [x] **T13 — test first**: `SettingsKnowledgeBase.test.tsx` — selecting a strategy renders
  exactly its controls, seeded from config defaults (AC9).
- [x] **T14 — implement**: per-strategy params state + conditional controls in
  `SettingsKnowledgeBase.tsx`; add `chunk_params` to `AppConfig`.
- [x] **T15 — test first**: editing a param + re-ingest sends it via `reindexCorpus` (AC10).
- [x] **T16 — implement**: extend `reindexCorpus`/`chunkPreview` in `chatApi.ts` to serialize
  params; pass from the component.

## Cross-cutting

- [x] **T17 — i18n**: add `settings.kb.params.*` (en + pt) per the plan table (§4).
- [x] **T18 — refactor**: dedupe bounds (single `CHUNK_PARAM_BOUNDS`), tidy, keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test.
- [x] `ruff check .` + `ruff format .` clean.
- [x] `pytest -q` green (with `OPENAI_API_KEY`; keyless structural tests still run).
- [x] `npm run build` (`tsc --noEmit` + build) + `npm test` (Vitest) green.
- [x] No `Stage`/`events.ts` change; `STAGE_TO_STATION` / `STAGE_TO_PHASE` untouched.
- [x] All new user-facing text exists in en **and** pt.
- [x] `spec.md` status → `done`.
- [x] Consider GitHub Pages demo re-capture (058) — the Settings KB params are config-driven;
  confirm whether `_config.json` fixture needs `chunk_params`.
