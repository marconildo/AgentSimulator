# Plan: Rerank score threshold (minimum-relevance filter)

> Status `clarified` (2026-06-11): threshold on the rerank score, applied after rerank,
> tunable slider in Settings → Experiment. Default `0` (opt-in, byte-for-byte).

## Approach

The threshold rides the existing 054 rerank path. `reranker.rerank` is unchanged (it
still returns the reordered top-k + full movement); the **filtering happens in
`retriever.retrieve`**: after `result.ranked` (top-k), keep only those with
`rerank_score ≥ threshold`. The `rag.rerank` END additionally carries `threshold` and
marks each movement entry kept/dropped, so the UI can show *why* a chunk fell out.
Threshold reaches the retriever the same way `top_k` does — a request-only value carried
through `AgentState`. `0` filters nothing (scores are ≥ 0), so omitting it is exactly
054.

## Affected files

**Backend**
- `backend/app/schemas.py` — `ChatRequest.rerank_threshold: float | None = Field(None, ge=0, le=1)`.
- `backend/app/config.py` — `rerank_threshold_default: float = 0.0`.
- `backend/app/main.py` — resolve `req.rerank_threshold`; pass into `run_agent`; expose
  `default_rerank_threshold` + `rerank_threshold_step` in `/api/config`.
- `backend/app/agent/state.py` — add `rerank_threshold: float` to `AgentState`.
- `backend/app/agent/graph.py` — thread `rerank_threshold` into `run_agent(_state)` and
  through to the `rag_retrieve` call (like `scenario`/`top_k`).
- `backend/app/rag/retriever.py` — `retrieve(..., rerank_threshold=0.0)`: after rerank,
  `selected = [c for c in result.ranked if c["rerank_score"] >= threshold]`; emit
  `threshold` on the `rag.rerank` END.

**Frontend**
- `frontend/src/lib/experiment.ts` — `rerankThreshold` in `ConvExperiment`;
  `overridesFor` sends `rerank_threshold` when `> 0`.
- `frontend/src/settings/SettingsExperiment.tsx` — a slider (0..1, step 0.05) beside top-k.
- `frontend/src/lib/chatApi.ts` — `default_rerank_threshold` + step on the config type.
- `frontend/src/lib/ragPipeline.ts` — carry `threshold` onto the `rerank` stage data;
  `kept` count on `retrieval` already reflects survivors (reads `rag.retrieve` chunks).
- `frontend/src/components/InspectorPanel.tsx` (`RerankMovementList`) +
  `frontend/src/components/RagStageDetail.tsx` — mark `below threshold` vs `kept`
  (kept = `new_rank ≤ k && score ≥ threshold`).
- `frontend/src/i18n/strings.ts` — slider label + "below threshold" + helper text (en/pt).

## Protocol changes (constitution §1)
- No new `Stage`. Additive keys on `rag.rerank` END (`threshold`, per-candidate kept).
- New request-only `ChatRequest.rerank_threshold` (no `events.ts` Stage mirror needed).

## Data model changes
None (no Chroma / SQLite change; threshold is a per-request knob).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| settings slider label | `Rerank score threshold` | `Limiar de score do rerank` |
| settings hint | `Drop chunks the reranker scored below this — fewer but cleaner.` | `Descarta chunks com score abaixo disso — menos, porém mais limpos.` |
| rerank movement `below threshold` | `below threshold` | `abaixo do limiar` |

## Cloud map (constitution §5)
n/a (no new tier/station).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `rerank_threshold` bounds + 422; None/0 = unchanged | `backend/tests/test_chat_request_model.py` / `test_rag_rerank.py` |
| AC2 | a below-threshold top_k chunk is dropped from grounding; t=0 keeps all | `backend/tests/test_rag_rerank.py` `@openai` |
| AC3 | all-below ⇒ empty grounding, run completes | `backend/tests/test_rag_rerank.py` |
| AC4 | `rag.rerank` END carries `threshold` | `backend/tests/test_rag_rerank.py` |
| AC5 | `/api/config` default+step; `overridesFor` sends it only when >0 | `test_config_042.py`, `experiment.test.ts` |
| AC6 | RerankMovementList marks below-threshold; retrieval kept reflects it | `ragPipeline.test.ts` + a movement render test |
| AC7 | simple unchanged | `test_rag_rerank.py` (simple has no rag.rerank) |
| AC8 | new strings en + pt | i18n parity (tsc over `Strings`) |

## Risks / trade-offs
- **Quality:** the whole point — dropping noise raises grounding precision. The risk is a
  threshold set too high dropping useful chunks; mitigated by default `0` + a visible
  slider so the effect is observed, not hidden.
- **Empty grounding:** at a high threshold the agent may get no chunks — handled (AC3),
  it just answers ungrounded (today's no-retrieval path).
- **FlashRank score scale:** scores observed in 0..1; the slider matches. If a future
  reranker emits a different scale, revisit the bounds.
- **Byte-for-byte Simple/054:** threshold `0` changes nothing; AC7 + AC1 pin it.
