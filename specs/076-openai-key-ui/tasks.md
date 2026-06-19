# Tasks: OpenAI API key in the UI + dynamic model listing

> Ordered TDD checklist. Builds on 074 (`app_config`, `/api/settings/*`, `/api/*/models`).

## Constitution

- [ ] **T0 — re-amend §2**: `.specify/constitution.md` — the OpenAI key may come from the
  UI/DB (DB precedes env); still required (DB or env) for OpenAI runs. (spec AC1)

## Backend — effective key

- [ ] **T1 — test (red)**: `test_openai_key_ui.py` — `effective_openai_key()` returns the
  DB key when set, else env; empty both ⇒ `get_provider()`/`get_embeddings()` fail fast;
  `/api/health.has_key` reflects the effective key. (AC1)
- [ ] **T2 — impl (green)**: `config.py` `effective_openai_key()` (lazy store import) +
  `has_effective_openai_key()`; route `provider.py` + `embeddings.py` through it;
  `main.py` health uses it.

## Backend — settings (save + test + mask)

- [ ] **T3 — test (red)**: `PUT /api/settings/openai` saves to `app_config`;
  `GET` returns `{has_key, masked, source}` and never the full key; blank `PUT` clears;
  persists across a new store. (AC2)
- [ ] **T4 — impl (green)**: `GET/PUT /api/settings/openai` in `main.py` (mask helper).
- [ ] **T5 — test (red)**: a save with an invalid key reports a structured non-500 error;
  a valid one reports connected (OpenAI client mocked). (AC3)
- [ ] **T6 — impl (green)**: connection test inside `PUT` (cheap `/v1/models` call, caught).

## Backend — dynamic model listing + relaxed validation

- [ ] **T7 — test (red)**: `GET /api/openai/models` filters chat models from a mocked
  `/v1/models`; no-key/failure ⇒ `{reachable:false, models:[]}`. (AC4)
- [ ] **T8 — impl (green)**: `GET /api/openai/models` (effective key, filter gpt-*/o-*).
- [ ] **T9 — test (red)**: `/api/chat` + `PATCH /api/agents` accept any non-empty OpenAI
  model; empty rejected. Update `test_models_065.py` / `test_chat_request_model.py` for the
  relaxed rule. (AC5)
- [ ] **T10 — impl (green)**: relax the model 422 to "non-empty" for OpenAI (mirror Ollama).

## Frontend

- [ ] **T11 — test (red)**: `ProviderSection.openaiKey.test.tsx` — OpenAI branch shows the
  key field + Save; saving calls `setOpenAISettings`, on success lists live models
  (mocked `getOpenAIModels`) + shows connected; invalid key shows the error; a saved key
  shows the masked hint. (AC6)
- [ ] **T12 — impl (green)**: `chatApi.ts` (`get/setOpenAISettings`, `getOpenAIModels`);
  ProviderSection OpenAI branch; ModelSection live-list (OpenAI) + fix the stale
  "will use" note; refresh `useHealth` after save.
- [ ] **T13 — i18n**: `agentAnatomy.provider.openaiKey.*` in en + pt. (AC7)

## Close-out

- [ ] **T14 — regression**: backend `pytest -q` + FE `npm test` + `npm run build` green;
  env-only path unchanged. (AC8)
- [ ] **T15 — docs**: `docs/data-model.md` `app_config` note — values may be secrets
  (masked on read).
- [ ] **T16 — refactor**: tidy; flip `spec.md` status `planned → done`.
- [ ] **T17 — demo check** (standing rule): 058 build runs no provider — no re-capture;
  confirm + note.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green with `OPENAI_API_KEY` (keyless guard + new tests pass w/o key)
- [ ] `npm run build` + `npm test` green
- [ ] No protocol change; no new table
- [ ] New user-facing text exists in en **and** pt
- [ ] Constitution §2 re-amended; the key is never returned in full by any endpoint
- [ ] `spec.md` status updated to `done`
