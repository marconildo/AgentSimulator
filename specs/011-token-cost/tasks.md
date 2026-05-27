# Tasks: Real token + cost accounting

> TDD checklist for `011-token-cost`. Red → green → refactor.

## Tasks

- [x] **T1 — test first (AC1)**: `backend/tests/test_pricing.py` — `cost_usd`
      dot-product for `gpt-4o-mini`; unknown model ⇒ 0.0. (Fails: no `pricing.py`.)
- [x] **T2 — implement**: `backend/app/llm/pricing.py` (`MODEL_PRICES`, `cost_usd`,
      `usage_metrics`) → T1 green.
- [x] **T3 — implement (capture)**: `provider.py` `TokenUsage` + `Decision.usage` +
      `last_stream_usage`; `openai_provider.py` reads usage from `decide` and
      `stream_answer` (`stream_usage=True`).
- [x] **T4 — implement (emit)**: `graph.py` — add `usage_metrics(...)` to the
      `agent.think/end` and `llm.generate/end` `metrics`.
- [x] **T5 — test (AC2, [openai])**: add `test_llm_calls_carry_token_usage_and_cost`
      to `test_agent.py` — think/generate ends carry `prompt_tokens>0`,
      `total_tokens>0`, `cost_usd>=0`.
- [x] **T6 — test first (AC3)**: `frontend/src/lib/derive.usage.test.ts` — events
      with usage metrics ⇒ `deriveView().usage` rounds + sums (and partial mid-run).
- [x] **T7 — implement**: `derive.ts` `UsageTotals` + aggregation → T6 green.
- [x] **T8 — implement (AC4 render)**: `cost.ts` formatters; `StationNode` inner
      rows, `FlowCanvas` readout (+ thread `view.usage` into node data),
      `InspectorPanel` usage section.
- [x] **T9 — i18n (AC6)**: add en + pt labels; `i18n/strings.test.ts` parity green.
- [x] **T10 — regression (AC5)**: backend `pytest -q`, `ruff check .`; frontend
      `npm test` + `npm run build` all green.
- [x] **T11 — refactor**: tidy, keep green; spec/tasks status → done.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `ruff check .` clean · `pytest -q` green (with `OPENAI_API_KEY`)
- [x] `npm test` green · `npm run build` passes (`tsc --noEmit` + build)
- [x] No protocol enum change; `schemas.py` ↔ `events.ts` still in sync; every Stage mapped
- [x] All new labels exist en **and** pt
- [x] `spec.md` status → `done`
