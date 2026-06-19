# Spec: Ollama embeddings (OpenAI-free RAG)

| | |
|---|---|
| **ID** | 075-ollama-embeddings |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

## Problem / motivation

Spec 074 made **chat/LLM** run on a local Ollama server with no OpenAI key — but
**embeddings still require OpenAI** (`rag/embeddings.py` → `OpenAIEmbeddings`, fails
fast without a key). So an Ollama-only deployment can chat, but its RAG is dead: the
Chroma index can't be (re)built and `search_knowledge_base` errors when it embeds the
query. The constitution-§2 promise of "may run with Ollama alone" is therefore only
half-true today.

This spec lets the user point **embeddings** at a local model too — they deploy their
own embedding model on Ollama (e.g. `ollama pull nomic-embed-text`) and the simulator
builds + queries the vector index against it. With chat **and** embeddings on Ollama,
the app runs with **no OpenAI key at all** (RAG included).

## Goals

- The embedding **provider** is selectable: **OpenAI** (default) or **Ollama (local)**.
- When Ollama is chosen, the user picks an installed embedding model (e.g.
  `nomic-embed-text`); the backend embeds via the local server.
- The choice is **persisted** (survives restart) and the **Chroma index rebuilds
  automatically** when the embedding provider/model changes (the persisted dimension no
  longer matches), so retrieval never silently returns nonsense.
- With embedding provider = Ollama **and** every agent on Ollama, the app **boots,
  builds the index, retrieves, and chats with no `OPENAI_API_KEY`**.
- OpenAI embeddings stay the default — an unchanged install behaves exactly as before.

## Non-goals

- No **per-agent** embedding choice. Embeddings are **instance-global**: one Chroma
  collection has one vector dimension; you cannot mix embedding models in it. (This is
  the key difference from the per-agent chat provider in 074.)
- No automatic `ollama pull` of an embedding model from the UI (we only list/select).
- No re-ranker change (FlashRank cross-encoder is local + keyless already, 054).
- No new pipeline `Stage` — embeddings already ride the existing `rag.embed` /
  ingestion stages.
- No mixing providers per query, and no migration of existing vectors between models
  (a provider/model change is a full rebuild of the corpus index).

## User-facing behavior

In **Settings** (instance-wide config, not the per-agent dialog):

- A new **"Embeddings (RAG)"** section with a provider radio: **OpenAI** /
  **Ollama (local)**.
- When Ollama is selected: a **model** field/dropdown (installed models from the local
  server, reusing the 074 server URL) and a short note that changing it **rebuilds the
  index**. A visible **rebuild** affordance + status (reuses the existing re-ingest
  stream, 072) so the user sees Chunking → Embedding → Storing run against the new model.
- An honest hint when the chosen embedding model isn't reachable/installed (bilingual),
  mirroring 074's "unreachable / pull a model first" messaging.

All new prose ships in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1 (factory routing)** — `get_embeddings()` returns a real **Ollama** embeddings
   object when the embedding provider is `ollama` (no `OPENAI_API_KEY` required); the
   `openai` path is unchanged and still fails fast without a key. *(keyless test)*
2. **AC2 (persistence)** — the embedding provider + model are persisted (`app_config`)
   and survive restart; defaults come from env (`EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`).
   `GET/PUT /api/settings/embeddings` round-trips them. *(keyless test)*
3. **AC3 (auto-rebuild on change)** — when the persisted index was built with a
   different embedding provider/model, `index_matches_model()` reports a mismatch so
   startup (and the explicit rebuild) re-ingests against the active model. Switching
   provider never leaves a stale-dimension index serving queries. *(test, mocked dims)*
4. **AC4 (OpenAI-free RAG, integration)** — with embedding provider = Ollama and a
   reachable server + installed embedding model, the corpus index builds and a query
   retrieves a relevant chunk, **with no OpenAI key set**. *(marked `@pytest.mark.ollama`,
   skipped without a server.)*
5. **AC5 (boot is safe)** — with provider = Ollama but the server unreachable, startup
   still **boots** (index build fails gracefully, as today) and the Settings UI shows the
   unreachable hint rather than crashing. *(test)*
6. **AC6 (UI)** — the Settings "Embeddings (RAG)" section persists the provider/model and
   surfaces the rebuild affordance + unreachable hint. *(Vitest)*
7. **AC7 (bilingual)** — every new string exists in **en** and **pt**. *(Vitest + review)*
8. **AC8 (default unchanged)** — with the default (OpenAI) embeddings, `get_embeddings`,
   index build, retrieval, and Settings behave exactly as before. *(existing suite green.)*

## Protocol / stage impact

- New/changed `Stage`(s): **none** (embeddings ride `rag.embed` + the 072 ingestion
  stages already).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to: **none** new (the Vector DB / Ingestion stations already own it).

## Open questions (clarify before planning)

- [x] Per-agent or instance-global embeddings? → **Instance-global** (one collection =
  one dimension). *(architecture; user intent 2026-06-19)*
- [x] Separate embedding server URL, or reuse the 074 `ollama_base_url`? → **Reuse** the
  same local server URL (typical setup runs one Ollama for chat + embeddings). A distinct
  URL can be a later spec if asked.
- [ ] Should switching the embedding provider **block** until the rebuild finishes, or
  rebuild lazily on next startup/explicit trigger? *(lean: explicit trigger + startup
  auto-detect, never a silent blocking call inside a chat.)*

## Out of scope / deferred

- Per-agent or per-collection embedding models; distinct embedding server URL.
- Migrating existing vectors between embedding models (always a full rebuild).
- Embeddings on other providers (e.g. a hosted non-OpenAI API).
