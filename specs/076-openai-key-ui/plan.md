# Plan: OpenAI API key in the UI + dynamic model listing

> HOW for `spec.md` (076). Builds on 074's `app_config` key/value table + the
> `/api/settings/*` + `/api/<provider>/models` patterns. Re-amends constitution §2.

## Approach

Add an **effective OpenAI key** resolver: `effective_openai_key()` returns the DB
`app_config.openai_api_key` when set, else `settings.openai_api_key` (env). `get_provider`
(OpenAI branch) and `get_embeddings` call it instead of reading the env-bound setting
directly; both still fail fast with `MissingAPIKeyError` when the effective key is empty.
The resolver lives in `config.py` with a **lazy** store import (store imports config, so the
import must be inside the function to avoid a cycle).

The key is entered/saved from the Provider section and persisted via
`PUT /api/settings/openai` (writes `app_config`). Reads (`GET /api/settings/openai`) return
only `{has_key, masked, source}` — the full key never leaves the server. Saving also
**tests the connection** (a cheap `/v1/models` call with the key); the result rides the
`PUT` response. `GET /api/openai/models` lists the live chat models (filtered to gpt-*/o-*),
mirroring 074's `/api/ollama/models`; on no-key/failure it returns a structured
`{reachable:false, models:[]}` so the FE falls back to the curated list.

The curated allowlist (042/065) stops being a hard gate: with dynamic listing the live list
is the truth, so `/api/chat` + `PATCH /api/agents` accept any **non-empty** model for OpenAI
(same shape as the Ollama relaxation in 074). Curated `models_payload()` stays as the
offline/default prefill.

No protocol change. No new table (reuse `app_config`).

**Alternatives considered:** (a) DB-only key — rejected (breaks CI/Docker; user chose
env-fallback). (b) keep curated hard-gate — rejected (user wants live listing). (c) encrypt
the key at rest — deferred (single-instance local trust model, documented).

## Affected files

**Backend**
- `.specify/constitution.md` — **re-amend §2**: key may come from the UI/DB (DB precedes
  env); still required (DB or env) for OpenAI runs.
- `backend/app/config.py` — `effective_openai_key()` (lazy store import) + a
  `has_effective_openai_key()` helper; `MissingAPIKeyError` message mentions the UI option.
- `backend/app/llm/provider.py` — OpenAI branch uses `effective_openai_key()`; fail-fast on
  empty.
- `backend/app/rag/embeddings.py` — same effective-key resolution.
- `backend/app/main.py` — `/api/health.has_key` from the effective key;
  `GET/PUT /api/settings/openai` (save+test, masked read); `GET /api/openai/models` (live
  `/v1/models`, filtered, effective key); relax the model 422 to non-empty for OpenAI.
- `backend/app/db/store.py` — reuse `app_config`; key `openai_api_key`. (No schema change.)
- `backend/app/llm/models.py` — keep curated `models_payload()` as fallback; note dynamic
  listing supersedes the hard allowlist (validation moves to "non-empty").
- `backend/tests/` — `test_openai_key_ui.py` (effective key precedence, settings round-trip
  + mask, model listing mocked, relaxed validation); update `test_models_065.py` /
  `test_chat_request_model.py` for the relaxed (non-empty) rule.

**Frontend**
- `frontend/src/agent-anatomy/ProviderSection.tsx` — OpenAI branch: API-key field
  (password) + Save + status (testing/connected/error), masked hint for a saved key.
- `frontend/src/agent-anatomy/ModelSection.tsx` — OpenAI branch lists live
  `getOpenAIModels()` when a key is set; curated fallback otherwise. Fix the stale
  "this conversation will use" to read the agent's model per provider.
- `frontend/src/lib/chatApi.ts` — `getOpenAISettings` / `setOpenAISettings` (save+test) /
  `getOpenAIModels`; `AppConfig` unaffected (curated stays as fallback).
- `frontend/src/lib/health.ts` — `hasKey` already exists; refresh after a key save so the
  no-key banner clears without reload.
- `frontend/src/i18n/strings.ts` — `agentAnatomy.provider.openaiKey.*` (en + pt).

## Protocol changes (constitution §1)

None.

## Data model changes

No new table/column. Reuse `app_config` (074) with the key `openai_api_key`. It is operator
config (preserved by `clear_all`) — **but** it is a secret: read endpoints mask it, and
`docs/data-model.md`'s `app_config` note gains a "values may be secrets (masked on read)"
line. Chroma unaffected.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `agentAnatomy.provider.openaiKey.label` | OpenAI API key | Chave de API da OpenAI |
| `agentAnatomy.provider.openaiKey.placeholder` | sk-… | sk-… |
| `agentAnatomy.provider.openaiKey.savedHint` | A key is saved ({masked}). Enter a new one to replace it. | Uma chave está salva ({masked}). Informe outra para substituir. |
| `agentAnatomy.provider.openaiKey.save` | Save & test | Salvar e testar |
| `agentAnatomy.provider.openaiKey.testing` | Testing the connection… | Testando a conexão… |
| `agentAnatomy.provider.openaiKey.connected` | Connected — {n} models found. | Conectado — {n} modelos encontrados. |
| `agentAnatomy.provider.openaiKey.failed` | Couldn't authenticate. Check the key. | Não foi possível autenticar. Verifique a chave. |
| `agentAnatomy.provider.openaiKey.envNote` | Falls back to the OPENAI_API_KEY env when empty. | Usa a env OPENAI_API_KEY quando vazio. |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | effective key DB-precedes-env; empty ⇒ fail fast; health reflects it | `tests/test_openai_key_ui.py` |
| AC2 | PUT saves, GET masks (never full key), blank clears, persists | `tests/test_openai_key_ui.py` |
| AC3 | save tests connection; invalid key ⇒ structured error (mocked) | `tests/test_openai_key_ui.py` |
| AC4 | `GET /api/openai/models` filters chat models (mocked); no-key ⇒ reachable:false | `tests/test_openai_key_ui.py` |
| AC5 | `/api/chat` + PATCH accept any non-empty OpenAI model; empty rejected | `tests/test_openai_key_ui.py` (+ update 065/model tests) |
| AC6 | Provider key field saves+tests; Model lists live; masked hint; errors | `frontend/src/agent-anatomy/ProviderSection.openaiKey.test.tsx` |
| AC7 | new strings in en + pt | Vitest strings test + review |
| AC8 | env-only path unchanged | existing suites green |

## Risks / trade-offs

- **Secret in plaintext SQLite** — accepted under the single-instance local trust model;
  masked on read, documented; encryption is a deferred spec.
- **Relaxing the curated allowlist** — a typo'd model id now reaches OpenAI and errors
  honestly at call time instead of a pre-emptive 422. Net: matches the dynamic-list intent;
  the dropdown is populated from the live list so typos are unlikely. Update the 2–3 tests
  that asserted the 422.
- **Live `/v1/models` is chatty/per-account** — cached in the FE per save; the backend
  call is mocked in tests. Filtering to gpt-*/o-* avoids listing embeddings/audio models.
- **Constitution re-amendment** — §2 changes again (key source). Done in the same change.
- **CI** — keeps using the env key (DB empty in CI), so AC8 holds and no secret is needed
  in the DB for tests.
