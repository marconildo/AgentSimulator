# Spec: Vertex AI embeddings (GCP-native RAG)

|            |                             |
| ---------- | --------------------------- |
| **ID**     | 095-vertex-ai-embeddings    |
| **Status** | done                        |
| **Author** | Elizeu Reis                 |
| **Date**   | 2026-06-24                  |

## Problem / motivation

Spec 089 introduced **Vertex AI** as a real third LLM chat provider. Spec 075
did the same for embeddings — but only added **Ollama** alongside the default
OpenAI. So a Vertex AI–only deployment can chat, but its RAG still requires
either an OpenAI key (for `text-embedding-3-small`) or a local Ollama server
(for `nomic-embed-text`). A user who has a GCP project with Vertex AI enabled
and wants a fully GCP-native stack today cannot embed via Vertex AI.

This spec adds **Vertex AI** as a third selectable **embedding provider**
(instance-global, like the existing two). The user picks an embedding model from
the Vertex AI family (e.g. `gemini-embedding-2`), and the backend embeds via
`langchain_google_vertexai.VertexAIEmbeddings`, reusing the same GCP project,
location, and credentials already persisted by 089. With chat **and** embeddings
both on Vertex AI, the app runs on GCP alone — no OpenAI key, no local Ollama.

## Goals

- The embedding **provider** radio gains a third option: **Vertex AI**.
- When Vertex AI is chosen, the user picks the `gemini-embedding-2` model; the backend embeds via the GCP project.
- The choice reuses the **GCP project, location, and credentials** already
  persisted by 089 (`app_config` rows: `vertexai_project`, `vertexai_location`,
  `vertexai_credentials`) — no separate credentials entry for embeddings. *(Note: because `gemini-embedding-2` is a global model, the default location for embeddings defaults to `global` if empty.)*
- The Chroma index **rebuilds automatically** when the embedding
  provider/model changes (same `embedding_signature` mechanism from 075).
- With embedding provider = Vertex AI **and** every agent on Vertex AI, the app
  **boots, builds the index, retrieves, and chats with no `OPENAI_API_KEY`** and
  no Ollama server.
- OpenAI and Ollama embedding paths are **byte-for-byte unchanged**.

## Non-goals

- No **per-agent** embedding choice. Embeddings remain **instance-global**: one
  Chroma collection has one vector dimension; you cannot mix embedding models.
- No dynamic model listing from the Vertex AI API (the dropdown lists a curated,
  static set of Vertex AI embedding models).
- No new pipeline `Stage` — embeddings already ride the existing `rag.embed` /
  ingestion stages.
- No change to the re-ranker (FlashRank is local + keyless, 054).
- No separate GCP credentials for embeddings — they share the 089 settings.

## User-facing behavior

In **Settings** (instance-wide config, the `SettingsEmbeddings` section):

- The **provider radio** adds a third option: **Vertex AI** (alongside OpenAI
  and Ollama).
- When Vertex AI is selected: a **model dropdown** shows the curated embedding
  models (e.g. `gemini-embedding-2`). If GCP credentials are not yet configured
  (089 settings), a hint directs the user to configure them first.
- Changing the provider/model triggers the same rebuild-note and signature
  mechanism as 075 — the index rebuilds on next startup / re-ingest.
- An honest hint when the Vertex AI credentials are missing or the chosen
  embedding model isn't reachable (bilingual).

All new prose ships in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1 (factory routing)** — `get_embeddings()` returns a real
   `VertexAIEmbeddings` object when the embedding provider is `vertexai`, using
   the persisted GCP project/location/credentials from 089. No `OPENAI_API_KEY`
   required. *(keyless test)*
2. **AC2 (persistence)** — the embedding provider accepts `"vertexai"` and the
   model is persisted (`app_config`). `GET/PUT /api/settings/embeddings`
   round-trips `provider: "vertexai"` + a Vertex AI model name (defaulting to `gemini-embedding-2`). *(keyless test)*
3. **AC3 (auto-rebuild on change)** — switching to `vertexai` changes the
   `embedding_signature`, so `index_matches_model()` reports a mismatch and
   startup (or explicit rebuild) re-ingests against the Vertex AI model.
   *(test, mocked dims)*
4. **AC4 (GCP-free RAG, integration)** — with embedding provider = Vertex AI and
   valid GCP credentials + project, the corpus index builds and a query retrieves
   a relevant chunk, **with no OpenAI key set**. *(marked
   `@pytest.mark.vertexai`, skipped without credentials.)*
5. **AC5 (boot is safe)** — with provider = Vertex AI but no GCP credentials
   configured, startup still **boots** (index build fails gracefully, as today)
   and the Settings UI shows the missing-credentials hint rather than crashing.
   *(test)*
6. **AC6 (UI)** — the Settings "Embeddings (RAG)" section shows Vertex AI as a
   third radio, persists the provider/model, and surfaces the
   missing-credentials hint + the curated model dropdown when selected. *(Vitest)*
7. **AC7 (bilingual)** — every new string exists in **en** and **pt**. *(Vitest
   + review)*
8. **AC8 (default unchanged)** — with the default (OpenAI) embeddings,
   `get_embeddings`, index build, retrieval, and Settings behave exactly as
   before. Existing Ollama path also unchanged. *(existing suite green.)*

## Protocol / stage impact

- New/changed `Stage`(s): **none** (embeddings ride `rag.embed` + the 072
  ingestion stages already).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none** new (the Vector DB / Ingestion
  stations already own it).

## Open questions (clarify before planning)

- [x] Which curated Vertex AI embedding models to list?
  `gemini-embedding-2` (1536d, latest/default). The `gemini-embedding-001` model is removed because it is deprecated/unavailable in the global endpoint.
- [x] Should selecting Vertex AI embeddings require the 089 credentials to
  already be saved (validate on provider switch), or allow selection and show a
  hint to configure credentials later? Allow selection and show a hint.

## Out of scope / deferred

- Per-agent or per-collection embedding models; distinct GCP credentials for
  embeddings separate from the chat provider.
- Dynamic model listing via the Vertex AI API.
- Embeddings on other providers (e.g. Anthropic, Cohere).
