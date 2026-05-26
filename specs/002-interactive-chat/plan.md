# Plan: Interactive Chat

> The HOW for `spec.md` (status `clarified`). Respects `.specify/constitution.md`.
> **Depends on `003-openai-only`** — assumes no demo mode (OpenAI always available), so
> there is no demo gate and tests run against OpenAI.

## Approach

Three layers of change, driven by the spec's decisions:

1. **Relational model becomes session-scoped** (D8). The single global `conversations`
   table is replaced by `sessions` + `messages` + `documents`. The pipeline's `db.read`/
   `db.write` and `read_history` become scoped to a `session_id`. Each message persists the
   chunks retrieved for it (D5).
2. **RAG gains user documents** in one shared Chroma collection (D2), tagged with metadata
   (`corpus`/`session_id`/`document_id`). Retrieval filters to `corpus OR active session`
   (D3). A new **ingestion pipeline** (PDF → extract → chunk+tokenize → embed → store) is
   exposed over an SSE endpoint and **emits three new trace stages** (D4) so the canvas
   animates it, surfacing chunking strategy, token counts, model/dims and a vector preview
   (per the spec's "see all the detail of the embedding process").
3. **The sidebar becomes a real chat** (D7/D9): a conversation list ↔ open-thread toggle,
   message bubbles with persisted RAG chunks highlighted, and controls for New chat / Clear /
   Upload PDF / remove document. New REST endpoints back it; the central canvas keeps
   projecting from the trace event log for both a chat send and a PDF upload.

*Alternative considered:* a collection-per-session (rejected in clarify, Q2) — it can't do a
single unified top-k across corpus + uploads, which D3 wants.

## Affected files

**Backend**
- `backend/app/schemas.py` — add `Stage.RAG_INGEST_CHUNK/EMBED/STORE`; add `session_id` to
  `ChatRequest`; add `session_id` to the SSE `done` payload (and `DoneEvent` mirror).
- `backend/app/db/store.py` — new schema (`sessions`, `messages`, `documents`); `PRAGMA
  foreign_keys=ON`; session-scoped `read_history(session_id)`, `write_message(...,
  chunks)`, plus session/message/document CRUD. (Keep class name `ConversationStore`.)
- `backend/app/rag/store.py` — keep one collection; corpus docs tagged `corpus=True`.
- `backend/app/rag/ingest.py` — tag corpus docs `corpus=True`; on rebuild delete only
  `where={"corpus": True}` then re-add, so a corpus rebuild never wipes user uploads.
- `backend/app/rag/retriever.py` — `retrieve(query, k, emitter, session_id)` passes
  `filter={"$or": [{"corpus": True}, {"session_id": session_id}]}` to the search.
- `backend/app/rag/ingestion.py` *(new)* — `ingest_pdf(bytes, filename, session_id,
  document_id, emitter)`: extract (pypdf) → chunk + tokenize (tiktoken) → embed
  (`get_embeddings()`) → store with metadata; emits the three ingest stages with rich data.
- `backend/app/agent/state.py` — `AgentState` gains `session_id`.
- `backend/app/agent/graph.py` — thread `session_id` into `retrieve_node` / `run_agent`.
- `backend/app/main.py` — `/api/chat` takes `session_id` (lazy-create if absent), scopes
  read/write, persists retrieved chunks, sets session title from first message; **new REST
  endpoints** (below).
- `backend/requirements.txt` — add `pypdf`, `tiktoken`.

**New REST endpoints** (plain JSON, not the SSE trace protocol unless noted):
- `POST /api/sessions` → create empty session `{id, title:null, created_at}`.
- `GET /api/sessions` → list `{id, title, created_at, updated_at, message_count}` recent-first.
- `DELETE /api/sessions/{id}` → delete session + messages (keeps embeddings — D6).
- `GET /api/sessions/{id}/messages` → `[{id, message, answer, chunks, created_at}]`.
- `POST /api/sessions/{id}/documents` → **SSE** PDF upload (multipart in, ingest stages out).
  On done: persists a `documents` row, emits `{document_id, filename, chunk_count}`.
- `GET /api/sessions/{id}/documents` → `[{document_id, filename, chunk_count, created_at}]`.
- `DELETE /api/sessions/{id}/documents/{document_id}` → delete that doc's vectors + row.

**Frontend**
- `frontend/src/types/events.ts` — mirror the three new `Stage`s; add `session_id` to
  `DoneEvent`.
- `frontend/src/lib/stations.ts` — add the three ingest stages to the **`rag`** station's
  `stages[]` (bilingual blurb/tech mention of ingestion). `STAGE_TO_STATION` auto-derives.
- `frontend/src/lib/derive.ts` — no projection change needed (new stages map to `rag`); the
  upload trace also emits `frontend`/`backend` so the packet routes client→api→rag.
- `frontend/src/components/FlowCanvas.tsx` — extend the `rag` `readoutFor` case for ingestion.
- `frontend/src/components/InspectorPanel.tsx` — extend the `rag` `renderDetail` case to show
  chunking strategy, token counts, model/dims, vector preview, stored count.
- `frontend/src/lib/chatApi.ts` *(new)* — sessions/messages/documents fetchers; SSE upload;
  `streamChat`/`batchChat` gain `session_id`.
- `frontend/src/lib/sse.ts` — `streamChat`/`batchChat` accept `session_id`; add an SSE upload
  helper reusing the existing parser.
- `frontend/src/store/useChat.ts` *(new)* — sessions, activeSessionId, messages, documents,
  list↔thread view, loading/errors. (Trace/cursor stays in `useSimulator`; chat send + upload
  both feed `useSimulator.events` so the canvas animates.)
- `frontend/src/components/ChatPanel.tsx` — rebuilt into list + thread (bubbles with chunk
  highlights, input, New chat / Clear / Upload PDF, document list + remove).
- `frontend/src/i18n/strings.ts` — new bilingual chat strings + ingest readout/detail labels.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `Stage.RAG_INGEST_CHUNK = "rag.ingest.chunk"`,
  `RAG_INGEST_EMBED = "rag.ingest.embed"`, `RAG_INGEST_STORE = "rag.ingest.store"`.
- `frontend/src/types/events.ts` — add the three string literals to `Stage`; add
  `session_id: string` to `DoneEvent`.
- Emitted in: `backend/app/rag/ingestion.py` (driven by `POST /api/sessions/{id}/documents`).
- Mapped to station in `stations.ts`: **`rag`** (added to its `stages` array — no new
  `StationId`).
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) case added: **extend the
  existing `rag` case** (the switches stay exhaustive over `StationId`).
- `ChatRequest.session_id` is request-only — not part of the `TraceEvent` mirror.

**Stage payloads (the "embedding process detail"):**
- `rag.ingest.chunk` — `data`: `{strategy, chunk_size, chunk_overlap, num_chunks, total_chars,
  previews:[…], token_counts:[…]}`; `metrics`: `{num_chunks, total_tokens}`.
- `rag.ingest.embed` — `data`: `{model, dim, num_vectors, preview:[8 floats]}`; `metrics`:
  `{dim, num_vectors}`.
- `rag.ingest.store` — `data`: `{collection, document_id, filename, chunks_stored,
  total_in_collection, metadata_keys}`; `metrics`: `{chunks_stored}`.

## Data model changes

**Relational (SQLite, D8 — drop & recreate, no migration):**
```sql
sessions(id TEXT PK, title TEXT NULL, created_at REAL, updated_at REAL)
messages(id TEXT PK, session_id TEXT FK→sessions ON DELETE CASCADE,
         message TEXT, answer TEXT, chunks TEXT DEFAULT '[]', created_at REAL)
documents(id TEXT PK, session_id TEXT FK→sessions ON DELETE CASCADE,
          filename TEXT, chunk_count INT, created_at REAL)
```
- `chunks` is a JSON array of retrieved chunks (D5): `[{text, source, title, score}]`.
- `read_history(session_id, limit)` returns recent `{message, answer}` for that session only.
- `DELETE session` cascades to `messages` + `documents` rows but **not** Chroma vectors (D6).

**Vector (Chroma, D2 — one shared collection, single embedding model):**
- Corpus docs: `metadata = {corpus: True, source, title, chunk}`.
- Uploaded docs: `metadata = {corpus: False, session_id, document_id, filename, chunk}`.
- Retrieval filter (D3): `{"$or": [{"corpus": True}, {"session_id": <active>}]}`.
- Delete-by-document: `ids = store.get(where={"document_id": id})["ids"]; store.delete(ids)`.
- Corpus and uploads share one OpenAI embedding dimension, so they coexist in one collection
  with no dimension handling (the old demo↔openai mismatch is gone — see `003-openai-only`).

## i18n strings (constitution §4)

New/changed keys under `chat` (+ a few `readout`/`inspector`). All shipped en **and** pt.

| key / location | en | pt |
|---|---|---|
| `chat.conversations` | Conversations | Conversas |
| `chat.newChat` | New chat | Nova conversa |
| `chat.clear` | Clear conversation | Limpar conversa |
| `chat.clearConfirm` | Delete this conversation? | Apagar esta conversa? |
| `chat.empty` | No conversations yet | Ainda sem conversas |
| `chat.untitled` | New conversation | Nova conversa |
| `chat.back` | Conversations | Conversas |
| `chat.you` | You | Você |
| `chat.agent` | Agent | Agente |
| `chat.sources` | Sources used | Fontes usadas |
| `chat.uploadPdf` | Upload PDF | Enviar PDF |
| `chat.documents` | Documents | Documentos |
| `chat.removeDoc` | Remove | Remover |
| `chat.chunksStored` | (n) => `${n} chunks` | (n) => `${n} trechos` |
| `chat.uploading` | Ingesting… | Processando… |
| `chat.uploadFailed` | Upload failed | Falha no envio |
| `readout.ingestChunking` | (n) => `chunking · ${n}` | (n) => `dividindo · ${n}` |
| `readout.ingestEmbedding` | (n) => `embedding ${n}` | (n) => `incorporando ${n}` |
| `readout.ingestStored` | (n) => `stored ${n} ✓` | (n) => `${n} armazenados ✓` |
| `inspector.ingestion` | PDF ingestion | Ingestão de PDF |
| `inspector.chunkStrategy` | chunking strategy | estratégia de chunking |
| `inspector.chunkSize` | chunk size / overlap | tamanho / sobreposição |
| `inspector.tokens` | tokens per chunk | tokens por chunk |
| `inspector.vectors` | vectors stored | vetores armazenados |

(Exhaustive final list finalized while building the components — every string en+pt.)

## Cloud map (constitution §5)

No new tier or station — ingestion reuses the existing **`rag`** station and the
**`database`** station, whose `clouds` maps are already filled. New REST endpoints don't add
infrastructure. → **n/a**.

## Test strategy (constitution §9 — TDD)

All tests run against OpenAI (per `003-openai-only`; CI key secret). Assertions are
**structural** (rows persisted, vectors tagged/filtered, stages fired in order) rather than
exact generated text, to tolerate model variability.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | send in a session → message+answer persisted under session_id; history scoped | `tests/test_api.py`, `tests/test_db.py` |
| AC2 | upload PDF → `documents` row + vectors tagged `session_id`/`document_id`/`corpus=False` | `tests/test_ingestion.py` |
| AC3 | delete document → only that `document_id`'s vectors removed (corpus/others intact) | `tests/test_ingestion.py` |
| AC4 | delete session → session+messages gone; new session shown; vectors remain | `tests/test_api.py`, `tests/test_db.py` |
| AC5 | `GET /api/sessions` recent-first, titled by first message; `GET …/messages` returns history | `tests/test_api.py` |
| AC6 | `POST /api/sessions` returns a new id; appears in list | `tests/test_api.py` |
| AC7 | query in a session with PDFs → unified top-k over corpus+session; other sessions excluded | `tests/test_ingestion.py` |
| AC8 | message persists retrieved chunks; `GET …/messages` returns them | `tests/test_db.py`, `tests/test_api.py` |
| AC9 | upload emits `rag.ingest.chunk→embed→store` in order with detail payloads | `tests/test_ingestion.py` |
| protocol | new stages serialize to dotted strings; enum stable | `tests/test_protocol.py` |
| retrieval | `retrieve(..., session_id)` with the `$or` filter returns corpus chunks | `tests/test_rag.py` |
| chunking/tokenize | `extract_pdf_text` + `chunk_text` + token counting on a tiny fixture PDF | `tests/test_ingestion.py` |

Frontend has a Vitest runner (`npm test`, in CI) plus `tsc --noEmit` + `vite build`. Pure
logic (`derive.ts`) is unchanged (new stages map to `rag`), so no new projection test is
required; the chat UI and the extended `rag` readout/detail are guarded by the type-check and
build, and verified manually.

## Risks / trade-offs

- **Orphaned vectors grow** (D6): cleared sessions leave their vectors. Harmless (filtered out
  by `session_id`), but unbounded over time; GC deferred (out of scope).
- **`tiktoken` first-run** may fetch an encoding file; pin the encoding by model and cache it.
- **Sidebar width** (340px, D9) is tight for a list + thread + controls; the list↔thread
  toggle keeps it usable but the layout needs care.
- **Scope**: a large frontend surface (new store + rebuilt chat). Backend is guarded by tests;
  frontend leans on Vitest + tsc/build + manual verification.
- **Depends on `003-openai-only`** landing first (or together) so the no-demo assumptions hold.
