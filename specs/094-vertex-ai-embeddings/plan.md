# Plan: Vertex AI embeddings (GCP-native RAG)

> **Spec**: [094-vertex-ai-embeddings](spec.md)

## Approach

Follow the **exact pattern** established by 075-ollama-embeddings: a third
branch in the embeddings factory (`get_embeddings`), a third allowed value in
the Settings API, and a third radio in the frontend `SettingsEmbeddings`
component. The Vertex AI credentials/project/location are **not duplicated** —
they are read from the same `app_config` rows that 089 persists.

## Affected files

### Backend

| File | Change |
|---|---|
| `app/config.py` | Add `effective_vertexai_*` helper functions (read GCP project/location/credentials from `app_config`, falling back to env). Import-cycle–safe (lazy store import, same as `effective_openai_key`). |
| `app/rag/embeddings.py` | Add a third branch: `if provider == "vertexai"` → lazy-import `VertexAIEmbeddings` from `langchain_google_vertexai`, passing `model_name`, `project`, `location`, and `credentials`. |
| `app/main.py` | Expand `_EMBEDDING_PROVIDERS` from `("openai", "ollama")` to `("openai", "ollama", "vertexai")`. No new endpoints — the existing `GET/PUT /api/settings/embeddings` already accept any value in the tuple. |
| `app/llm/models.py` | Add `CURATED_VERTEXAI_EMBEDDING_MODELS` (a tuple of `CuratedModel`) and a `vertexai_embedding_models_payload()` function for the dropdown. |
| `tests/test_vertexai_embeddings.py` | **[NEW]** Mirrors `test_ollama_embeddings.py` — keyless unit tests for AC1–AC3, AC5. |

### Frontend

| File | Change |
|---|---|
| `src/lib/chatApi.ts` | Update `EmbeddingSettings.provider` TSDoc comment to include `"vertexai"`. No new API function — `getEmbeddingSettings`/`setEmbeddingSettings` already suffice. |
| `src/settings/SettingsEmbeddings.tsx` | Add Vertex AI radio + curated model dropdown (from a static list or from an endpoint). Show a missing-credentials hint when Vertex AI is selected but 089 credentials are not configured (`getVertexAISettings().has_credentials === false`). |
| `src/settings/SettingsEmbeddings.test.tsx` | Add tests for the Vertex AI radio, dropdown render, and missing-credentials hint (AC6). |
| `src/i18n/strings.ts` | Add `settings.embeddings.vertexai` label + `settings.embeddings.vertexaiHint` (missing credentials) in both `en` and `pt` (AC7). |

### No changes

- No `Stage`/`Phase`/`TraceEvent` changes — constitution §1 untouched.
- No `stations.ts`, `phases.ts`, or inspector changes.
- No cloud-map changes.

## Protocol / i18n / cloud impact

- **Protocol**: none.
- **i18n**: 2–3 new strings in `settings.embeddings.*` (`vertexai`, `vertexaiHint`, `vertexaiModelPlaceholder`), both `en` and `pt`.
- **Cloud**: none (no new tier/station).

## Test strategy

| AC | Test | Kind |
|---|---|---|
| AC1 | `test_get_embeddings_vertexai_needs_no_openai_key` — monkeypatch keyless Settings, set DB `embedding_provider=vertexai` + model + creds, assert `get_embeddings()` returns a `VertexAIEmbeddings`. | Unit (keyless) |
| AC2 | `test_embedding_settings_round_trip_vertexai` — `PUT {provider: "vertexai", model: "gemini-embedding-2"}`, `GET`, assert round-trip. | Unit (keyless) |
| AC3 | `test_index_matches_model_false_on_vertexai_switch` — change signature from `openai:text-embedding-3-small` to `vertexai:gemini-embedding-2`, assert `index_matches_model() is False`. | Unit (mocked) |
| AC4 | `test_vertexai_embeddings_real_index_build` — full build + query with real Vertex AI. | Integration (`@pytest.mark.vertexai`, skipped without creds) |
| AC5 | `test_vertexai_embeddings_boot_safe_without_credentials` — provider=vertexai but no credentials → `get_embeddings()` raises `MissingVertexAICredentialsError`, app boots. | Unit (keyless) |
| AC6 | Vitest: render `SettingsEmbeddings`, select Vertex AI radio, assert dropdown appears + hint when no credentials. | Vitest |
| AC7 | Review + existing i18n parity test. | Review |
| AC8 | Existing test suite passes unmodified. | CI green |
