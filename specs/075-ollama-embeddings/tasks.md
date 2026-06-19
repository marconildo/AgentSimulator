# Tasks: Ollama embeddings (OpenAI-free RAG)

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives
> it (red → green → refactor). Builds on 074 (provider seam, `app_config`, `/api/ollama/models`).

## Backend — embeddings factory

- [x] **T1 — test (red)**: `test_ollama_embeddings.py` — `get_embeddings()` with the
  embedding provider set to `ollama` returns a real Ollama embeddings object and needs **no**
  `OPENAI_API_KEY`; the `openai` path still fails fast without a key. (AC1)
- [x] **T2 — impl (green)**: `config.py` `embedding_provider` (env `EMBEDDING_PROVIDER`);
  route `rag/embeddings.py` `get_embeddings()` by the **effective** provider (DB
  `app_config` else env), Ollama branch via `OllamaEmbeddings(base_url=ollama_base_url,
  model=embedding_model)` (lazy import). Add `embedding_provider_name()`.

## Backend — persistence + auto-rebuild

- [x] **T3 — test (red)**: `GET/PUT /api/settings/embeddings` round-trips provider+model,
  persists across a new store, defaults from env. (AC2)
- [x] **T4 — impl (green)**: `GET/PUT /api/settings/embeddings` in `main.py`
  (`app_config` keys `embedding_provider`/`embedding_model`); fold effective values into
  `/api/config`.
- [x] **T5 — test (red)**: `index_matches_model()` returns False when the persisted
  collection stamp (`embedding_provider:embedding_model`) differs from the active one,
  even if dimensions coincide (mock the probe + metadata). (AC3)
- [x] **T6 — impl (green)**: stamp `{embedding_provider, embedding_model}` into the Chroma
  collection metadata at build; compare it in `index_matches_model()` alongside the dim.
- [x] **T7 — test (red)**: provider=ollama + unreachable server → `ConversationStore` /
  app startup boots, index build is caught (no crash). (AC5)
- [x] **T8 — impl (green)**: confirm/guard the lifespan + store paths swallow an
  unreachable-embedding error (reuse existing try/except; add coverage if a path is exposed).

## Backend — integration (marker)

- [x] **T9 — integration**: `test_ollama_embeddings.py::test_openai_free_rag`
  `@pytest.mark.ollama` — with provider=ollama + a real local embed model and **no OpenAI
  key**, build the index and retrieve a relevant chunk. Skipped without a server. (AC4)

## Frontend

- [x] **T10 — test (red)**: `EmbeddingsSection.test.tsx` — selecting Ollama persists
  provider/model via `setEmbeddingSettings`, lists installed models (mocked `getOllamaModels`),
  shows the rebuild affordance + unreachable hint. (AC6)
- [x] **T11 — impl (green)**: `chatApi.ts` (`get/setEmbeddingSettings`, `AppConfig`
  embedding fields); `EmbeddingsSection` mounted in `SettingsPage`; rebuild reuses the 072
  re-ingest stream.
- [x] **T12 — i18n**: add all `settings.embeddings.*` strings in **en + pt**. (AC7)

## Close-out

- [x] **T13 — regression**: full backend `pytest -q` + FE `npm test` + `npm run build`
  green; default OpenAI-embeddings path unchanged. (AC8)
- [x] **T14 — refactor**: tidy, keep green; flip `spec.md` status `planned → done`.
- [x] **T15 — demo check** (standing rule): the 058 GitHub Pages build runs no provider —
  embeddings change shouldn't need a re-capture; confirm + note.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (AC4 marker-gated)
- [x] `ruff check .` + `ruff format .` clean
- [x] `pytest -q` green with `OPENAI_API_KEY` (keyless + Ollama-keyless tests pass w/o key)
- [x] `npm run build` (`tsc --noEmit` + build) + `npm test` green
- [x] No protocol change (no Stage/station/phase touched)
- [x] New user-facing text exists in en **and** pt
- [x] An Ollama-only deployment (chat + embeddings on Ollama) runs with **no OpenAI key**
- [x] `spec.md` status updated to `done`
