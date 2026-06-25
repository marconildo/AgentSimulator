# Tasks: 095-vertex-ai-embeddings

> **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

## TDD checklist

### 1. Backend — config helpers

- [ ] **Test (AC1 red):** Write `test_get_embeddings_vertexai_needs_no_openai_key`
  — monkeypatch keyless Settings, set DB `embedding_provider=vertexai`,
  `embedding_model=gemini-embedding-2`, plus mock GCP creds → assert
  `get_embeddings()` returns a `VertexAIEmbeddings` instance. **Must fail.**
- [ ] **Implement:** Add `effective_vertexai_project()`,
  `effective_vertexai_location()`, `effective_vertexai_credentials()` to
  `config.py` (DB-first, env-fallback, same pattern as `effective_openai_key`).
- [ ] **Implement:** Add `if provider == "vertexai"` branch in
  `rag/embeddings.py::get_embeddings()` — lazy-import
  `langchain_google_vertexai.VertexAIEmbeddings`, pass `model_name`, `project`,
  `location`, `credentials`. Raise `MissingVertexAICredentialsError` when no
  credentials are available.
- [ ] **Green:** `test_get_embeddings_vertexai_needs_no_openai_key` passes.

### 2. Backend — settings API

- [ ] **Test (AC2 red):** Write
  `test_embedding_settings_round_trip_vertexai` — `PUT` with
  `{provider: "vertexai", model: "gemini-embedding-2"}`, `GET`, assert
  round-trip. **Must fail** (unknown provider 422).
- [ ] **Implement:** Expand `_EMBEDDING_PROVIDERS` in `main.py` from
  `("openai", "ollama")` to `("openai", "ollama", "vertexai")`.
- [ ] **Green:** `test_embedding_settings_round_trip_vertexai` passes.

### 3. Backend — auto-rebuild signature

- [ ] **Test (AC3 red):** Write
  `test_index_matches_model_false_on_vertexai_switch` — set stored signature to
  `openai:text-embedding-3-small`, switch provider/model to
  `vertexai:gemini-embedding-2`, assert `index_matches_model() is False`.
  **Must fail** (should already pass if the signature mechanism is generic).
- [ ] **Green:** Confirm the existing signature mechanism works for the new
  provider value (no code change expected).

### 4. Backend — boot safety

- [ ] **Test (AC5 red):** Write
  `test_vertexai_embeddings_boot_safe_without_credentials` — provider=vertexai,
  no GCP credentials in DB or env → `get_embeddings()` raises
  `MissingVertexAICredentialsError`. **Must fail** until the branch is in place.
- [ ] **Green:** Passes after step 1's implementation.

### 5. Backend — curated embedding models

- [ ] **Implement:** Add `CURATED_VERTEXAI_EMBEDDING_MODELS` to
  `llm/models.py` and a `vertexai_embedding_models_payload()` function.
- [ ] **Implement:** Wire the payload into `/api/config` (or
  `/api/settings/embeddings` GET) so the FE can list the models.

### 6. Frontend — Settings UI

- [ ] **Test (AC6 red):** Write Vitest test — render `SettingsEmbeddings`,
  assert Vertex AI radio exists, clicking it persists `provider: "vertexai"`,
  and the curated dropdown appears.
- [ ] **Test (AC6 red):** Write Vitest test — when Vertex AI is selected and
  `getVertexAISettings()` reports `has_credentials: false`, the
  missing-credentials hint appears.
- [ ] **Implement:** Add third radio option to `SettingsEmbeddings.tsx` for
  Vertex AI + curated model dropdown + missing-credentials hint.
- [ ] **Green:** Both Vitest tests pass.

### 7. Frontend — i18n (AC7)

- [ ] **Implement:** Add `settings.embeddings.vertexai`,
  `settings.embeddings.vertexaiHint` (and any other new strings) in both `en`
  and `pt` blocks of `strings.ts`.
- [ ] **Green:** i18n parity check passes.

### 8. Regression (AC8)

- [ ] **Verify:** Full `pytest -q` + `npm test` + `npm run build` green.
  Existing embeddings tests unchanged and passing.

### 9. Integration (AC4, optional)

- [ ] **Test:** `test_vertexai_embeddings_real_index_build` — full build +
  query with real Vertex AI credentials. Marked `@pytest.mark.vertexai`,
  skipped without credentials.
