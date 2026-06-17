# Tasks: Provider field + refreshed OpenAI model list

## Tasks

- [x] **T1 — test first (AC1/AC2/AC3)**: `backend/tests/test_models_065.py` —
  assert `model_ids()` equals the new set, `gpt-4o*` absent, default is
  `gpt-4.1-mini` ∈ list, `/api/chat` 422 on `gpt-4o-mini` & accepts `gpt-5.5`.
- [x] **T2 — implement**: refresh `CURATED_MODELS` in `app/llm/models.py`; flip
  `config.py` `llm_model` default to `gpt-4.1-mini`. Make T1 green.
- [x] **T3 — test first (AC4)**: `backend/tests/test_config_providers_065.py` —
  `/api/config` providers array (openai available / ollama preview) + `default_provider`.
- [x] **T4 — implement**: add `PROVIDERS` + `providers_payload()` + `DEFAULT_PROVIDER`
  to `models.py`; wire into `/api/config` in `main.py`. Make T3 green.
- [x] **T5 — fix pinned tests**: update `gpt-4o-mini` literals / default
  assertions in `test_request_body_echo.py`, `test_chat_request_model.py`,
  and any schema-integrity seed rows to a listed id (`gpt-4.1-mini`).
- [x] **T6 — test first (AC5)**: `AgentAnatomyDialog.provider.test.tsx` — Provider
  section present, OpenAI selected, Ollama control disabled.
- [x] **T7 — implement FE**: `agentAnatomySections.ts` union/order/icon;
  `ProviderSection.tsx`; dialog `sectionTitle`+`renderSection` cases;
  `chatApi.ts` `AppConfig.providers`/`ProviderInfo`. Make T6 green.
- [x] **T8 — i18n (AC6)**: `agentAnatomy.provider.*` en + pt in `strings.ts`;
  extend `i18n/agentAnatomy.test.ts` parity coverage.
- [x] **T9 — demo fixture (AC7)**: refresh `_config.json` models + add providers.
- [x] **T10 — refactor + gates**: `ruff check . && ruff format .`, `pytest -q`,
  `npm run build`, `npm test` all green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `ruff check .` clean
- [x] `pytest -q` green (needs `OPENAI_API_KEY`; allowlist/guard tests run keyless)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change (verified — no `Stage`/`events.ts` diff)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status → `done`
