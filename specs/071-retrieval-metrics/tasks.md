# Tasks: Retrieval-quality metrics (Precision@k · Recall@k · MRR)

> TDD checklist — red → green → refactor. Each implement task is preceded by the failing test.
> Order: pure math → golden set → wiring → config → frontend → i18n.

## Tasks

- [ ] **T1 — test first**: `test_retrieval_metrics.py` — exact values for `precision_at_k`,
  `recall_at_k`, `mrr` on hand-built rankings (AC2).
- [ ] **T2 — implement**: `backend/app/rag/metrics.py` pure functions + `evaluate(...)`. Make T1 green.
- [ ] **T3 — test first**: golden set loads, schema valid, every `relevant_sources` file exists in
  the corpus (AC1).
- [ ] **T4 — implement**: author `backend/app/data/retrieval_golden.json` (≥ 6 entries over the real
  corpus) + `load_golden()` / `match_golden(query)` (normalised lookup). Make T3 green.
- [ ] **T5 — test first**: labelled query run carries `eval` on `rag.retrieve` END; unlabelled does
  not; unlabelled byte-for-byte (AC3, AC4). `@openai` for the live run.
- [ ] **T6 — implement**: `retriever.retrieve` attaches `eval` on a golden hit (+ `mrr`/`precision`
  into `rec.metrics`). Make T5 green.
- [ ] **T7 — test first**: rerank-on MRR ≥ rerank-off for a chosen benchmark (AC5, `@openai`).
- [ ] **T8 — implement/tune**: pick the benchmark entry so the relevant chunk isn't dense-rank-1;
  confirm T7 green (no code change expected beyond golden-set authoring).
- [ ] **T9 — test first**: `/api/config` includes `benchmark_queries` (AC6).
- [ ] **T10 — implement**: extend `/api/config` in `main.py`. Make T9 green.
- [ ] **T11 — test first**: `ragPipeline.metrics.test.ts` — `eval` flows into the retrieval stage +
  per-chunk `relevant` flags (AC8).
- [ ] **T12 — implement**: read `eval` in `deriveRagPipeline`; add `RetrievalEval` to `events.ts`.
  Make T11 green.
- [ ] **T13 — test first**: `RagStageDetail.metrics.test.tsx` — Quality block when `eval` present;
  no-ground-truth line when absent (AC7).
- [ ] **T14 — implement**: render the Quality block + benchmark chips. Make T13 green.
- [ ] **T15 — i18n**: add `ragDetail.quality.*` + 3 glossary entries in en + pt (AC9); parity test green.
- [ ] **T16 — refactor**: tidy, keep all tests green.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; `@openai` tests skipped without)
- [ ] `npm run build` (`tsc --noEmit` + build) + `npm test` green
- [ ] No new `Stage`; `rag.retrieve` `eval` is additive; `events.ts` mirror updated (optional type)
- [ ] All new user-facing text in en **and** pt
- [ ] GitHub Pages demo (058): consider re-capturing a benchmark-query fixture so the mocked demo
  can show the metrics (see standing demo directive) — log it in the demo note if deferred
- [ ] `spec.md` status → `done`
