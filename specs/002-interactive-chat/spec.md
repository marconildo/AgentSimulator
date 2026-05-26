# Spec: Interactive Chat

| | |
|---|---|
| **ID** | 002-interactive-chat |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Turn the left sidebar into a **real, WhatsApp-style chat**: a list of recent
> conversations, each opening into its own message thread; the ability to send
> messages to the agent and see the full history persisted per conversation; a
> "New chat" action; and per-conversation PDF upload that is embedded into the
> vector store so RAG can ground answers on the user's own documents — with the
> retrieved chunks surfaced inside each chat message. The central canvas keeps
> animating the request pipeline on every send, and additionally **animates PDF
> ingestion** when a document is uploaded.
> We want to see all the detail of the embedding process — chunking strategy,
> tokenization, vectors — surfaced as the ingestion animates.

> **Depends on `003-openai-only`.** This spec assumes there is **no demo mode**: the
> app is OpenAI-only and a key is always present, so PDF ingestion (which needs real
> embeddings) is just part of the normal path and all tests run against OpenAI.

## Problem / motivation

Today the sidebar sends **one message at a time** with no visual history — there
is no notion of a conversation, no list of past threads, and the agent's RAG is
limited to the fixed built-in corpus. For the visualizer to tell a complete,
believable story, a user should be able to hold a real multi-turn conversation,
revisit prior threads, and — crucially — **bring their own documents** and watch
both the RAG **ingestion** and **retrieval** pipelines run over them, down to the
chunking, tokenization and embedding detail. This makes the "long-term memory" and
"RAG" stations concrete and personal instead of abstract.

## Goals

- A conversation **list** in the left sidebar (recent threads); selecting one opens
  its message thread (list ↔ thread toggle within the existing sidebar width).
- Opening a thread shows its **real history**, loaded from the application database,
  scoped per conversation by a `session_id`.
- Send new messages within a thread; the user message and the agent's answer both
  appear in the thread and are persisted.
- A **"New chat"** action that starts a fresh, empty conversation. This is the only
  thread-level header action besides going back to the list — the open thread offers
  **"New chat"**, not a destructive "Clear/Delete". **Updated 2026-05-26:** "New chat"
  opens an empty *draft* thread; the `session_id` is **created lazily on the first real
  action** (sending a message or uploading a PDF), so clicking "New chat" no longer
  leaves empty conversations in the history.
- ~~A **"Clear conversation"** action that deletes the current conversation and shows a
  new one.~~ **Removed 2026-05-26:** the thread header offered a destructive "Clear
  conversation" that deleted the active session from history; it is replaced by
  **"New chat"** (AC4 below superseded by AC6). Deleting a conversation is no longer
  exposed in the UI.
- A **"Upload PDF"** action that ingests a PDF into the vector store so the agent can
  retrieve from it, **animating the ingestion pipeline on the canvas** with full detail
  (chunking strategy, per-chunk tokenization, embedding model/dimensions, vector preview).
- Within a conversation, **list the documents** loaded for it, and allow **removing** a
  document — which deletes its embeddings from the vector store.
- For RAG-grounded answers, surface the **retrieved chunk content** inside the chat
  message, highlighted, **for every message in the history** (chunks are persisted).
- Keep using **Chroma** (one shared collection, metadata-scoped), wired through
  LangChain/LangGraph.

## Non-goals

- No multi-user / multi-tenant. Single local user, single instance, all state local
  (constitution §8).
- No production auth, sharing, or cross-device sync.
- No editing/renaming of past messages or conversations.

## User-facing behavior

The chat lives in the **left sidebar** (where it is today). It shows a scrollable
**list of recent conversations**, each labeled by its first message; selecting one
toggles into that thread's history. The user can create as many conversations as
they want ("New chat"), send messages, upload PDFs ("Upload PDF"), see and remove the
PDFs attached to a conversation, and clear a conversation. When an answer was grounded
by RAG, the chat shows the retrieved chunks (highlighted) attached to that answer — for
both live and historical messages. The central canvas continues to animate the full
request pipeline for every message sent, and animates **chunk → embed → store** (with
chunking/tokenization/embedding detail) when a PDF is uploaded.

*(All new prose ships in English **and** Portuguese — constitution §4.)*

## Decisions (clarified)

- **D1 — OpenAI-only, no gating.** Per `003-openai-only`, the app always runs against
  OpenAI, so PDF ingestion uses real embeddings as a normal part of the path — no demo
  gate, no offline/online split. All tests run against OpenAI (CI key secret, per 003).
- **D2 — One shared Chroma collection, metadata-scoped.** Documents carry metadata:
  `corpus: bool`, `session_id`, `document_id`. A manual corpus rebuild (`build_index()`)
  deletes only `where={"corpus": True}` so it never wipes user uploads. (With a single
  embedding model there is no dimension-mismatch to handle.)
- **D3 — Unified retrieval.** A query retrieves a single top-k over `corpus == true` **OR**
  `session_id == <active>`, so base corpus + this conversation's PDFs rank together; other
  conversations' PDFs are excluded.
- **D4 — Ingestion is visualized in full.** New stages `rag.ingest.chunk`,
  `rag.ingest.embed`, `rag.ingest.store`; the upload endpoint streams them over SSE and the
  canvas animates the `rag` station, carrying chunking strategy, per-chunk token counts,
  embedding model/dimensions and a vector preview (constitution §1/§6).
- **D5 — Chunks persisted per message.** Each message row stores its retrieved chunks, so
  reopening a thread shows highlights for historical messages.
- **D6 — Clear keeps embeddings.** Deleting a conversation removes its messages/session but
  **leaves** its PDF embeddings in the store (orphaned, tagged with the old `session_id`,
  never retrieved by an active session). Granular per-document removal is the only path
  that deletes embeddings.
- **D7 — Title from first message.** A conversation is labeled by its first user message
  (truncated).
- **D8 — Fresh schema.** Replace the global `conversations` table with session-scoped
  `sessions` + `messages` + `documents` tables (drop & recreate; no migration of old rows).
- **D9 — Sidebar layout.** Keep the current sidebar width; toggle between the conversation
  list and the open thread.

## Acceptance criteria

> Numbered and testable. Each becomes a failing test first (TDD, §9). All tests run against
> OpenAI (per `003-openai-only`).

1. **AC1** — Given I create a conversation, when I send a message, then the message and the
   agent's answer appear in that conversation's history and are persisted under its
   `session_id`.
2. **AC2** — When I upload a PDF, then the PDF appears in the conversation's document list and
   its chunks are embedded into the vector store tagged with `session_id` and `document_id`
   (`corpus = false`).
3. **AC3** — Given I remove a PDF, when the document is removed, then exactly the chunks for
   that `document_id` are deleted from the vector store (corpus and other documents untouched).
4. **AC4** — ~~Given I clear the conversation, when "Clear conversation" is clicked, then the
   current conversation (session + messages) is deleted and a new conversation is shown; the
   conversation's PDF embeddings remain in the store and are not retrieved by the new
   session.~~ **Superseded 2026-05-26** — the thread no longer exposes a destructive clear;
   its primary action is "New chat" (AC6), which never deletes from history. The backend
   `DELETE /api/sessions/{id}` endpoint and `ConversationStore.delete_session` remain (used
   for maintenance/cleanup), they are just no longer wired to a UI button.
5. **AC5** — The conversation list shows sessions most-recent-first, each labeled by its first
   message; selecting one loads that session's message history from the DB.
6. **AC6** — "New chat" opens a fresh, empty **draft** thread and makes it active **without**
   persisting a session; the new `session_id` is created lazily on the first real action
   (first message sent or first PDF uploaded). A bare "New chat" click leaves no row in the
   history. **(Amended 2026-05-26 — was: created the `session_id` eagerly on click.)**
7. **AC7** — When the active conversation has PDFs, a query returns a unified top-k over the
   base corpus **and** that conversation's PDFs (filtered `corpus == true` OR `session_id ==
   active`), and never includes another conversation's PDFs.
8. **AC8** — Each message persists the chunks retrieved for it; reopening a thread shows the
   highlighted chunks for historical messages.
9. **AC9** — Uploading a PDF emits the ingestion stages `rag.ingest.chunk` → `rag.ingest.embed`
   → `rag.ingest.store` over SSE, in order, each carrying its detail payload (chunking
   strategy + chunk count, per-chunk token counts, embedding model/dimensions + vector
   preview, stored count), animating the `rag` station.

## Protocol / stage impact

Constitution §1 & §6.

- **New `Stage`s** (D4): `rag.ingest.chunk`, `rag.ingest.embed`, `rag.ingest.store`.
  - Mirror in `frontend/src/types/events.ts`: **required**.
  - Emitted in: the PDF ingestion path (new backend module), over an SSE upload endpoint.
  - Station in `stations.ts`: mapped to the existing **`rag`** station (added to its
    `stages` array).
  - `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel): the `rag` case is extended
    to handle the ingestion stages (no new `StationId`).
- **`ChatRequest` gains `session_id`** — request-only field; not a `Stage`/`Phase`/`TraceEvent`
  change. The SSE `done` payload (and `DoneEvent` mirror) gains `session_id`.
- **`db.read` / `db.write` payloads become session-scoped** — same `Stage`s, changed `data`
  shape only.
- **New REST endpoints** (not part of the SSE trace protocol): list/create/delete sessions;
  list a session's messages; upload (SSE) / list / delete a session's documents. Enumerated
  in `plan.md`.

## Open questions (clarify before planning)

None — resolved; see **Decisions** above.

## Out of scope / deferred

- Multi-user / cross-replica shared state (constitution §8).
- Renaming/editing past messages or conversations; exporting conversations.
- Garbage-collecting orphaned embeddings from cleared conversations (D6 leaves them).
- Non-PDF document types (txt/docx/etc.).
