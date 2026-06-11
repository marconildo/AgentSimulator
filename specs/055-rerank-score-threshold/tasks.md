# Tasks: Rerank score threshold (minimum-relevance filter)

> TDD checklist. Threshold `0` must stay byte-for-byte with 054 — that guard is the
> first test.

## Tasks

- [x] **T1 (AC1)**: `rerank_threshold` bounds 0..1 + 422; None default → `test_chat_request_model.py`.
- [x] **T2 (AC2/AC7)**: threshold 0 keeps full top_k (== 054); simple emits no rerank → `test_rag_rerank.py`.
- [x] **T3 (AC2/AC3/AC4)**: a high threshold drops below-score chunks from grounding;
      near-1 completes without crash; `rag.rerank` END carries `threshold` → `test_rag_rerank.py`.
- [x] **T4 (AC1–AC4)**: `schemas.py` `rerank_threshold`; `config.py` `rerank_threshold_default`;
      threaded `main.py` → `run_agent(_state)` → `AgentState.rerank_threshold` →
      `retriever.retrieve(rerank_threshold=…)`; filter `result.ranked` by score; emit `threshold`.
- [x] **T5 (AC5)**: `overridesFor` sends `rerank_threshold` only when `>0` → `experiment.test.ts`.
- [x] **T6 (AC5)**: `/api/config` `default_rerank_threshold` + `rerank_threshold_step`;
      `experiment.ts` `rerankThreshold`/`setRerankThreshold`; `chatApi.ts` `AppConfig` fields.
- [x] **T7 (AC6)**: `ragPipeline` rerank stage carries `threshold` → `ragPipeline.test.ts`.
- [x] **T8 (AC6)**: `SettingsExperiment` slider (0..1, step 0.05, aria-labelled);
      `RerankMovementList` marks "below threshold" (`inTopK && score < threshold`), passed the
      threshold from both `RagStageDetail` (RerankDetail) + InspectorPanel rag case.
- [x] **T9 (AC8)**: slider label/hint, "below threshold", "score threshold" — en + pt.
- [x] **T10 — refactor**: ruff + tsc + build + 469 vitest + backend tests green; status → done.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `ruff check .` + `ruff format .` clean
- [x] `pytest -q` green (backend rag/rerank/config/agent suites green with `OPENAI_API_KEY`)
- [x] `npm run build` + `npm test` (Vitest, 469) green
- [x] No new `Stage`; `rag.rerank` additive keys only (`threshold`)
- [x] Threshold `0` = byte-for-byte 054 (AC2/AC7)
- [x] All new user-facing text in en **and** pt
- [x] `spec.md` status → `done`
