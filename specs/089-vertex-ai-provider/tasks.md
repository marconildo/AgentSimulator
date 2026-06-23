# Tasks: Vertex AI provider

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Tasks

- [ ] **T1 — backend tests (red)**: create `backend/tests/test_vertexai_provider.py` asserting provider creation, settings endpoints, model allowlist, and connection validation.
- [ ] **T2 — backend settings & config**: update `backend/app/config.py` and `backend/app/llm/models.py` to support Vertex AI options and providers list.
- [ ] **T3 — backend provider & endpoints**: implement endpoints in `backend/app/main.py` and routing in `backend/app/llm/provider.py`.
- [ ] **T4 — VertexAIProvider**: implement `backend/app/llm/vertexai_provider.py` implementing `LLMProvider` using `langchain_google_vertexai`. Verify T1 passes.
- [ ] **T5 — frontend test (red)**: create `frontend/src/agent-anatomy/ProviderSection.vertexai.test.tsx` asserting the radio, input fields, test connection logic, and dropdown models.
- [ ] **T6 — frontend client & i18n**: update `frontend/src/lib/chatApi.ts` and `frontend/src/i18n/strings.ts` to add Vertex AI settings endpoints and bilingual translations.
- [ ] **T7 — frontend UI**: update `frontend/src/agent-anatomy/ProviderSection.tsx` and `ModelSection.tsx` to display and edit Vertex AI options. Verify T5 passes.
- [ ] **T8 — integration test**: run integration checks against a mock/real Vertex AI provider.
- [ ] **T9 — verify gates**: run full local mirror of CI (ruff check, pytest, npm run build, npm test).

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` clean
- [ ] `pytest -q` green
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
