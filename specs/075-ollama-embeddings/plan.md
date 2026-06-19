# Plan: Ollama embeddings (OpenAI-free RAG)

> HOW for `spec.md` (075). Builds directly on 074 (provider seam, `app_config`,
> `/api/ollama/models`, the Ollama server URL). Respects constitution §2 (post-074
> multi-provider) and §3 (everything real — Ollama embeddings are real).

## Approach

Mirror 074's provider seam, but for **embeddings** and at **instance** scope. Add an
`embedding_provider` setting (`openai` | `ollama`) alongside the existing
`embedding_model`. `get_embeddings()` routes: `openai` → today's `OpenAIEmbeddings`
(still fails fast without a key); `ollama` → `langchain_ollama.OllamaEmbeddings(base_url,
model)` (no OpenAI key needed). The server URL is the **same** persisted
`ollama_base_url` (074) — one local Ollama serves chat + embedding models.

Because one Chroma collection has one fixed vector dimension, embeddings cannot be
per-agent — they are instance-global, persisted in `app_config` (`embedding_provider`,
`embedding_model`) with env defaults. Changing either triggers a **full corpus rebuild**:
`index_matches_model()` already compares the persisted vs live dimension; we harden it by
also stamping the active `provider:model` into the collection metadata so a same-dimension
switch still rebuilds. Startup already auto-rebuilds on mismatch (`main.py` lifespan,
wrapped in try/except so an unreachable server boots cleanly — AC5). The explicit rebuild
reuses the 072 re-ingest SSE stream.

No protocol change: embeddings already ride `rag.embed` + the ingestion stages.

**Alternatives considered:** (a) per-agent embeddings — impossible without per-agent
collections (dimension clash); rejected. (b) a second embedding-only server URL — rejected
for now (reuse the 074 URL; most setups run one server). (c) silent lazy rebuild inside a
chat request — rejected (slow, surprising); rebuild is startup-detected + explicit.

## Affected files

**Backend**
- `backend/app/config.py` — `embedding_provider: str = "openai"` (env `EMBEDDING_PROVIDER`);
  `embedding_model` default stays `text-embedding-3-small`. A small validator/allowlist
  `{openai, ollama}`.
- `backend/app/rag/embeddings.py` — route `get_embeddings()` by the **effective** embedding
  provider (DB `app_config` value, else env); add `OllamaEmbeddings` branch (lazy import,
  base_url from the persisted `ollama_base_url`). `embedding_model_name()` resolves the
  effective model; add `embedding_provider_name()`.
- `backend/app/rag/store.py` — stamp `{embedding_provider, embedding_model}` into the
  collection metadata at build; `index_matches_model()` also compares the stamp (not just
  the dimension) so a same-dim provider/model switch rebuilds.
- `backend/app/main.py` — `GET/PUT /api/settings/embeddings` (provider + model); fold the
  effective embedding info into `/api/config` (so the FE prefills) and optionally
  `/api/health`. The existing `/api/rag/reindex` (072) is the rebuild trigger.
- `backend/app/db/store.py` — no schema change: reuse `app_config` (074) with new keys
  `embedding_provider`, `embedding_model`. (Keys are open-ended; `EXPECTED_TABLES`
  unchanged.)
- `backend/requirements.txt` — `langchain-ollama` already added by 074 (its
  `OllamaEmbeddings` ships in the same package); no new dep.
- `backend/tests/` — `test_ollama_embeddings.py` (routing, settings round-trip, rebuild
  detection, unreachable-boot) + an `@pytest.mark.ollama` integration test.

**Frontend**
- `frontend/src/settings/SettingsPage.tsx` (+ a new `EmbeddingsSection`) — instance-wide
  "Embeddings (RAG)" section: provider radio, model field (lists from
  `getOllamaModels`, reused from 074), rebuild button + status, unreachable hint.
- `frontend/src/lib/chatApi.ts` — `getEmbeddingSettings` / `setEmbeddingSettings`;
  `AppConfig` gains `embedding_provider` / `embedding_model`.
- `frontend/src/i18n/strings.ts` — new `settings.embeddings.*` strings (en + pt).

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed.

## Data model changes

No new table/column. Reuse the 074 `app_config` key/value table with two new keys:
`embedding_provider`, `embedding_model`. Like `ollama_base_url`, these are operator
**config** (not conversation data) → preserved by `clear_all`. Chroma collection metadata
gains an `embedding_provider`/`embedding_model` stamp (vector store, not SQLite).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `settings.embeddings.title` | Embeddings (RAG) | Embeddings (RAG) |
| `settings.embeddings.help` | Which model turns text into vectors for retrieval. Instance-wide. | Qual modelo transforma texto em vetores para a busca. Vale para toda a instância. |
| `settings.embeddings.openaiNote` | Cloud — needs an OpenAI key. | Nuvem — requer uma chave OpenAI. |
| `settings.embeddings.ollamaNote` | Local — deploy your own embedding model (e.g. nomic-embed-text). | Local — implante seu próprio modelo de embedding (ex.: nomic-embed-text). |
| `settings.embeddings.rebuildNote` | Changing the embedding model rebuilds the whole index. | Trocar o modelo de embedding reconstrói todo o índice. |
| `settings.embeddings.rebuild` | Rebuild index | Reconstruir índice |
| `settings.embeddings.rebuilding` | Rebuilding the index… | Reconstruindo o índice… |
| `settings.embeddings.unreachable` | Couldn't reach the Ollama server. Is it running? | Não foi possível acessar o servidor Ollama. Ele está rodando? |
| `settings.embeddings.noModel` | Pick an installed embedding model (ollama pull nomic-embed-text). | Escolha um modelo de embedding instalado (ollama pull nomic-embed-text). |

## Cloud map (constitution §5)

n/a — no new tier/station/boundary (embeddings live in the existing Vector DB /
Ingestion stations).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `get_embeddings()` → Ollama type, no key needed; openai still fails fast | `tests/test_ollama_embeddings.py` (keyless) |
| AC2 | `GET/PUT /api/settings/embeddings` round-trip + restart + env default | `tests/test_ollama_embeddings.py` (keyless) |
| AC3 | `index_matches_model()` mismatch on provider/model stamp change (dims mocked) | `tests/test_ollama_embeddings.py` |
| AC4 | OpenAI-free build + retrieve against a real local embed model | `tests/test_ollama_embeddings.py::…` `@pytest.mark.ollama` |
| AC5 | provider=ollama + unreachable server → store boots, build caught | `tests/test_ollama_embeddings.py` |
| AC6 | Settings Embeddings section persists + shows rebuild/unreachable | `frontend/src/settings/EmbeddingsSection.test.tsx` |
| AC7 | new strings present in en + pt | Vitest strings test + review |
| AC8 | default OpenAI embeddings path unchanged | existing suites stay green |

## Risks / trade-offs

- **CI has no Ollama** → AC4 is marker-gated/skipped (same pattern as 074 + 052).
- **Rebuild cost** — switching embedding model re-ingests the whole corpus; it's an
  explicit, visible action (072 stream), never hidden inside a chat.
- **Dimension-collision blind spot** — if two models share a dimension, the dimension
  probe alone wouldn't force a rebuild; the collection-metadata stamp closes that.
- **Embedding model ≠ chat model** — `/api/tags` lists both; the UI doesn't hard-validate
  that the picked model is an *embedding* model. A wrong pick yields an honest runtime
  error from Ollama (surfaced as the unreachable/failed hint), not a silent bad index.
- **Quality** — local embedding models may retrieve worse than OpenAI's; that's the
  user's tradeoff for going key-free, not a regression. Documented in the section note.
