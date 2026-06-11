# Tasks: RAG block expansion (Vector DB → full RAG drill-in + real reranker)

> TDD checklist — each implement task is preceded by the failing test that drives it
> (red → green → refactor). **T1 (Simple regression) is written first** so the byte-for-byte
> guarantee guards every later change. Do not start until `spec.md` open questions are resolved.

## Tasks

- [x] **T1 — test first (AC3, guardrail)**: stage-list guard for `scenario=simple` (embed →
      search → retrieve, no rerank) → `backend/tests/test_rag_rerank.py`
      (`test_simple_retrieval_has_no_rerank_stage`). Drives `rag_retrieve` directly (deterministic).
- [x] **T2 — test first (AC1)**: `scenario=intermediate` emits one `rag.rerank` END after
      `rag.search`, before `rag.retrieve`; simple emits none → `test_rag_rerank.py`.
- [x] **T3 — test first (AC2)**: `rag.rerank` END carries pre/post ranks (ordered by score),
      grounding uses the reranked order → `test_rag_rerank.py`.
- [x] **T4 — implement protocol (AC4)**: `Stage.RAG_RERANK` in `schemas.py`; mirrored in
      `events.ts`; mapped in `STAGE_TO_STATION` (`reranker` via `stages`) and `STAGE_TO_PHASE`
      (`retrieve`). `phases.test.ts` green.
- [x] **T5a — test first (AC2 unit)**: `test_reranker_unit.py` — `rag/reranker.py`
      deterministically promotes the relevant passage + trims to `top_k` (no key).
- [x] **T5 — implement reranker (AC1/AC2)**: `flashrank` in `requirements.txt`; new
      `rag/reranker.py` (FlashRank `Ranker`, lazy+cached, `RerankResult`); widened `fetch_k` in
      `retriever.py`; wired into `retrieve` under `emitter.stage(RAG_RERANK)` → trim to `top_k`,
      guarded by `scenario == "intermediate"` (graph passes `state["scenario"]`). Model
      pre-baked in `Dockerfile`; `rerank_*` settings in `config.py`.
- [x] **T6 — test first (AC5)**: `reranker` not `comingSoon`, `visibleStationsFor` includes it
      with `stages:["rag.rerank"]` (`scenario.test.ts`); `readoutFor` reranker cases
      (`FlowCanvas.readout.test.ts`).
- [x] **T7 — implement station (AC5)**: `stations.ts` drop `comingSoon`, `stages:["rag.rerank"]`,
      add `why`/`whatBreaks` (028 gate); `readoutFor` reranker case; `renderDetail` reranker case
      (shared `RerankMovementList`).
- [x] **T8 — test first (AC6)**: `RagDetail.test.tsx` — four panels + rerank movement on
      Intermediate, inactive note on Simple, empty state before any event.
- [x] **T9 — implement RagDetail (AC6)**: `RagDetail.tsx` (AgentDetail-style overlay); `rag` in
      `HAS_DETAIL` (open-full button) + `detail === "rag"` render in `App.tsx`.
- [x] **T10 — test first (AC7)**: `canSend("intermediate")` true (`scenario.test.ts`);
      `/api/config` `intermediate.available=true` (`test_scenario.py`).
- [x] **T11 — implement activation (AC7)**: `AVAILABLE.intermediate=true` (scenario.ts) +
      `SCENARIOS` (main.py).
- [x] **T12 — i18n (AC8)**: en + pt for RagDetail block, reranker readout (`reranking`/
      `reranked`), inspector rerank labels. Type-checked parity (`tsc` over `Strings`).
- [x] **T13 — refactor**: ruff + tsc + build + vitest + pytest green; spec status → `done`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` + `ruff format .` clean
- [x] `pytest -q` green (with `OPENAI_API_KEY`; keyless guard tests still run)
- [x] `npm run build` passes (`tsc --noEmit` + build) and `npm test` (Vitest, 457) green
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); `rag.rerank` mapped in
      `STAGE_TO_STATION` **and** `STAGE_TO_PHASE`
- [x] **Simple rung byte-for-byte unchanged** (AC3 test passes)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
