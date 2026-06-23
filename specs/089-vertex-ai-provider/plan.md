# Plan: Vertex AI provider (real third LLM provider)

## Approach

We will integrate Google **Vertex AI** as a real provider using `langchain-google-vertexai`. 
To avoid system dependencies when Vertex AI is not in use, the `langchain_google_vertexai` package is imported lazily inside a new `VertexAIProvider` class under `backend/app/llm/vertexai_provider.py`.

GCP credentials (`project`, `location`, `credentials` JSON) will be stored in the SQLite database's `app_config` key-value table. 
If credentials JSON is not provided in the UI, the provider falls back to environment-based Google Cloud authentication.

Curated Gemini models will be defined in `backend/app/llm/models.py` and exposed via `/api/config` to populate the frontend's Model dropdown when the active provider is `vertexai`.

## Affected files

**Backend**
- `backend/requirements.txt` — add `langchain-google-vertexai>=2.0.0`
- `backend/app/config.py` — add default environment settings for `vertexai_project`, `vertexai_location`, `vertexai_credentials`
- `backend/app/llm/models.py` — define `CURATED_VERTEXAI_MODELS` and append `vertexai` to `PROVIDERS` list
- `backend/app/llm/provider.py` — route `vertexai` provider request in `get_provider()`
- `backend/app/llm/vertexai_provider.py` [NEW] — implement `VertexAIProvider` extending `LLMProvider`
- `backend/app/main.py` — add `GET /api/settings/vertexai` and `PUT /api/settings/vertexai` endpoints, add defaults to `/api/config`

**Frontend**
- `frontend/src/lib/chatApi.ts` — add `getVertexAISettings` and `setVertexAISettings` client methods, extend `AppConfig` type
- `frontend/src/i18n/strings.ts` — add bilingual translation strings for Vertex AI settings
- `frontend/src/agent-anatomy/ProviderSection.tsx` — render Vertex AI radio, input fields, test connection button
- `frontend/src/agent-anatomy/ModelSection.tsx` — render the curated Gemini model dropdown when provider is `vertexai`

**Tests**
- `backend/tests/test_vertexai_provider.py` [NEW] — unit and integration tests for `VertexAIProvider`, settings endpoints, and validation
- `frontend/src/agent-anatomy/ProviderSection.vertexai.test.tsx` [NEW] — Vitest test asserting UI interaction with the Vertex AI provider settings

## Protocol changes (constitution §1)

- No changes to `backend/app/schemas.py` or `frontend/src/types/events.ts`.
- Mapped to station in `frontend/src/lib/stations.ts`: `none` (no new station/hop/tier, provider is request-only).

## Data model changes

- No SQL schema changes needed. The `agents.provider` column supports arbitrary text strings and already accepts `"vertexai"`.
- Instance-wide config values (`vertexai_project`, `vertexai_location`, `vertexai_credentials`) will be persisted as keys in the existing `app_config` key-value table.

## i18n strings (constitution §4)

We will add the following translation keys to `frontend/src/i18n/strings.ts` in both languages:

| key / location | en | pt |
|---|---|---|
| `agentAnatomy.provider.vertexaiNote` | Runs against Google Cloud Vertex AI. | Roda no Google Cloud Vertex AI. |
| `agentAnatomy.provider.projectLabel` | GCP Project ID | ID do Projeto no GCP |
| `agentAnatomy.provider.projectPlaceholder` | e.g. my-gcp-project | ex: meu-projeto-gcp |
| `agentAnatomy.provider.locationLabel` | GCP Location | Região/Localização no GCP |
| `agentAnatomy.provider.locationPlaceholder` | e.g. us-central1 | ex: us-central1 |
| `agentAnatomy.provider.credentialsLabel` | Google Service Account Key JSON (optional) | Chave JSON de Conta de Serviço do Google (opcional) |
| `agentAnatomy.provider.credentialsPlaceholder` | { "type": "service_account", ... } | { "type": "service_account", ... } |
| `agentAnatomy.provider.credentialsSavedHint` | Credentials are saved. Enter new JSON to replace. | As credenciais estão salvas. Informe um novo JSON para substituir. |
| `agentAnatomy.provider.vertexaiSave` | Save & test | Salvar e testar |
| `agentAnatomy.provider.vertexaiTesting` | Testing connection... | Testando conexão... |
| `agentAnatomy.provider.vertexaiConnected` | Connected — settings saved. | Conectado — configurações salvas. |
| `agentAnatomy.provider.vertexaiFailed` | Connection test failed. Check settings and credentials. | Falha no teste de conexão. Verifique as configurações e credenciais. |

## Cloud map (constitution §5)

`n/a` (no new tier or station added).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC2 (provider factory) | `test_vertexai_provider_creation_without_openai_key` | `backend/tests/test_vertexai_provider.py` |
| AC3 (per-agent persistence) | `test_vertexai_provider_agent_persistence` | `backend/tests/test_vertexai_provider.py` |
| AC4 (model validation) | `test_vertexai_model_validation` | `backend/tests/test_vertexai_provider.py` |
| AC5 (GCP settings persistence) | `test_vertexai_settings_endpoint` | `backend/tests/test_vertexai_provider.py` |
| AC6 (test connection) | `test_vertexai_connection_validation` | `backend/tests/test_vertexai_provider.py` |
| AC7 (real run, integration) | `test_vertexai_real_chat_run` (marked `@pytest.mark.vertexai`) | `backend/tests/test_vertexai_provider.py` |
| AC8 (FE provider+settings) | UI renders elements, triggers GET/PUT endpoints | `frontend/src/agent-anatomy/ProviderSection.vertexai.test.tsx` |
| AC9 (bilingual) | Check en + pt keys | `frontend/src/agent-anatomy/ProviderSection.vertexai.test.tsx` |
| AC10 (regression) | Existing OpenAI and Ollama tests pass | `backend/tests/...` |

## Risks / trade-offs

- **Dependency Size**: Adding `langchain-google-vertexai` pulls in Google auth/GCP packages, which increases the virtualenv footprint. Since it's imported lazily, it has zero impact on boot/import times when Vertex AI is unused.
- **Connection Test Cost**: Connection testing involves instantiating `ChatVertexAI` and querying or initializing a simple invocation. We must ensure this does not block the event loop.
