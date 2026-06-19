# Tasks: Ollama local provider

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives it
> (red → green → refactor). Check boxes as you go.

## Constitution (do first — the amendment unblocks everything)

- [x] **T0 — amend §2**: rewrite `.specify/constitution.md` §2 to "OpenAI default + real opt-in
  Ollama"; note the reconciliation with specs 003/058. (AC1)

## Backend — provider factory + Ollama impl

- [x] **T1 — test (red)**: `test_ollama_provider.py` — `get_provider(provider="ollama",
  model="x", base_url="http://h:11434")` returns a provider with `name == "ollama"` and
  raises **no** `MissingAPIKeyError` even with no `OPENAI_API_KEY`; `get_provider()` still
  fails fast. (AC2)
- [x] **T2 — impl (green)**: add `OllamaProvider` (`ollama_provider.py`, lazy `langchain_ollama`
  import, reuse assembly helpers); extend `get_provider(*, provider, model, base_url)` routing;
  add `langchain-ollama` to `requirements.txt`.

## Backend — persistence (agents.provider + app_config)

- [x] **T3 — test (red)**: `test_db.py` — fresh schema has `agents.provider` default `'openai'`
  and an `app_config` table; `get_config/set_config` round-trip; migration 3→4 on an old DB
  backfills provider. (AC3, AC5)
- [x] **T4 — impl (green)**: `_SCHEMA` += `provider` col + `app_config` table; bump
  `user_version` to 4 with additive migration; `get_config`/`set_config`; agent row adapter +
  `create`/`patch` carry `provider`.
- [x] **T5 — test (red)**: `test_schema_audit.py` — `EXPECTED_TABLES` includes `app_config`
  (and the column shows in the data-model doc audit). (AC3)
- [x] **T6 — impl (green)**: update `EXPECTED_TABLES` + `docs/data-model.md` (new table + column +
  cascade/clear notes).

## Backend — API surface

- [x] **T7 — test (red)**: `test_app_config.py` — `GET /api/settings/ollama` returns the env
  default; `PUT` updates it; a second `GET` (new store) reflects the persisted value. (AC5)
- [x] **T8 — impl (green)**: `config.py` `ollama_base_url`; `GET/PUT /api/settings/ollama`
  in `main.py`.
- [x] **T9 — test (red)**: `test_ollama_endpoints.py` — `GET /api/ollama/models` parses a mocked
  `/api/tags` body into model ids; an unreachable host → structured `{reachable: false, error}`
  (HTTP 200, not 500). (AC6)
- [x] **T10 — impl (green)**: `GET /api/ollama/models` (httpx → `/api/tags`, timeout, caught).
- [x] **T11 — test (red)**: `test_ollama_endpoints.py` — `/api/chat` returns 422 for an unlisted
  model only when provider is openai; an ollama-bound agent accepts any non-empty model; empty
  model rejected for both. `POST`/`PATCH /api/agents` round-trip `provider`. (AC3, AC4)
- [x] **T12 — impl (green)**: `schemas.py` `ChatRequest.provider` + agent in/out `provider`;
  `main.py` resolves `effective_provider`, scopes allowlist to openai, threads provider+base_url;
  `graph.py` `run_agent`/`run_agent_state` pass them to `get_provider`; `/api/config` advertises
  ollama available + default URL.
- [x] **T13 — integration (marker)**: `test_ollama_provider.py::test_real_ollama_run`
  `@pytest.mark.ollama` — structural stages + non-empty answer against a live server; skipped
  when none configured. Register the `ollama` marker. (AC7)

## Frontend

- [x] **T14 — test (red)**: `AgentAnatomyDialog.provider.test.tsx` — selecting **Ollama**
  persists `provider:"ollama"`, reveals Server-URL field + a model dropdown fed by a mocked
  `getOllamaModels`; unreachable mock shows the bilingual hint; selecting **OpenAI** restores
  the curated dropdown. (AC8)
- [x] **T15 — impl (green)**: `chatApi.ts` (`getOllamaModels`/`getOllamaSettings`/
  `setOllamaSettings`, agent `provider`, AppConfig URL); `agentAccess.ts` patches `provider`;
  interactive `ProviderSection`; provider-aware `ModelSection`.
- [x] **T16 — i18n**: add all `agentAnatomy.provider.*` strings in **en + pt**
  (`strings.ts`); strings test green. (AC9)

## Close-out

- [x] **T17 — regression**: full backend `pytest -q` + FE `npm test` + `npm run build` green;
  OpenAI default path unchanged. (AC10)
- [x] **T18 — refactor**: tidy, keep green; flip `spec.md` status `planned → done`.
- [x] **T19 — demo check** (standing rule): decide whether the 058 GitHub Pages fixtures need a
  re-capture (Ollama is BYO-key/local, so likely **no** — the demo build runs no provider —
  but confirm and note it).

## Definition of done

- [x] Every acceptance criterion maps to a passing test (AC7 marker-gated)
- [x] `ruff check .` + `ruff format .` clean
- [x] `pytest -q` green with `OPENAI_API_KEY` (keyless guard + Ollama keyless tests pass w/o key)
- [x] `npm run build` (`tsc --noEmit` + build) + `npm test` green
- [x] No protocol change (verified: no Stage/station/phase touched)
- [x] All new user-facing text exists in en **and** pt
- [x] Constitution §2 amended in this change; data-model doc + schema audit in sync
- [x] `spec.md` status updated to `done`
