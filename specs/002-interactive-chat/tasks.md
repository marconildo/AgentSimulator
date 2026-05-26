# Tasks: Interactive Chat

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded by
> the test that must fail first (red → green → refactor). Check boxes as you go and advance
> the spec status (`clarified → in-progress → done`).
>
> **Depends on `003-openai-only`** — land it first (or together) so the no-demo assumptions
> hold. All tests run against OpenAI (CI key secret) with structural assertions.

## Phase 1 — Protocol (§1)

- [x] **T1 — test first**: in `tests/test_protocol.py`, assert
  `Stage.RAG_INGEST_CHUNK/EMBED/STORE` serialize to `"rag.ingest.chunk/embed/store"`.
- [x] **T2 — implement**: add the three `Stage`s in `schemas.py`; add `session_id` to
  `ChatRequest`; add `session_id` to the `done` SSE payload.
- [x] **T3 — protocol mirror**: mirror the three stages in `frontend/src/types/events.ts`;
  add `session_id` to `DoneEvent`. (§1 — same change.)

## Phase 2 — Relational model (D8, D5)

- [x] **T4 — test first**: rewrite `tests/test_db.py` for the new schema — create/list/delete
  sessions; `write_message` + `read_history(session_id)` scoped; delete cascades to messages/
  documents; `chunks` JSON round-trips (D5); list/add/delete documents.
- [x] **T5 — implement**: new schema + `PRAGMA foreign_keys=ON` and the session/message/
  document methods in `db/store.py`.

## Phase 3 — Retrieval scoping (D3)

- [x] **T6 — test first**: in `tests/test_rag.py`, `retrieve(query, k, emitter, session_id)`
  with the `$or` filter still returns corpus chunks (corpus tagged `corpus=True`).
- [x] **T7 — implement**: tag corpus docs `corpus=True` in `rag/ingest.py`; add the `filter`
  to `rag/retriever.py`; thread `session_id` through `AgentState`, `retrieve_node`, `run_agent`.

## Phase 4 — Chat endpoint + session REST (AC1, AC4, AC5, AC6, AC8)

- [x] **T8 — test first**: update/extend `tests/test_api.py` — chat with `session_id`
  persists a `messages` row + its chunks (AC1, AC8); `POST/GET/DELETE /api/sessions` (AC5,
  AC6, AC4); `GET …/messages` returns history with chunks; first message sets the session
  title (D7).
- [x] **T9 — implement**: `/api/chat` takes `session_id` (lazy-create), scopes `db.read`/
  `db.write`, persists retrieved chunks (from the `rag.retrieve` END event), sets title; add
  the session/message endpoints + the document-list/delete endpoints.

## Phase 5 — PDF ingestion (D4, AC2, AC3, AC7, AC9)

- [x] **T10 — test first (chunking/tokenize)**: in `tests/test_ingestion.py`, test
  `extract_pdf_text`, `chunk_text`, and token counting against a tiny fixture PDF — chunk
  count + token counts are deterministic.
- [x] **T11 — test first (ingest flow)**: full `ingest_pdf` flow — emits `rag.ingest.chunk →
  embed → store` in order with the detail payloads (AC9); vectors tagged `session_id`/
  `document_id`/`corpus=False` (AC2); `DELETE …/documents/{id}` removes only that doc's
  vectors (AC3); a query in a session with PDFs returns unified top-k over corpus+session and
  excludes other sessions (AC7).
- [x] **T12 — implement**: add `pypdf` + `tiktoken` to `requirements.txt`; build
  `rag/ingestion.py` (extract → chunk+tokenize → embed → store, emitting the three stages);
  wire the SSE `POST /api/sessions/{id}/documents` endpoint and document persistence;
  change `build_index()` to delete only `where={"corpus": True}` (preserve uploads).

## Phase 6 — Frontend (§4, §6, §7)

- [x] **T13 — stations**: add the three ingest stages to the `rag` station `stages[]` in
  `stations.ts` (bilingual). Confirm `STAGE_TO_STATION` covers them.
- [x] **T14 — canvas readout/detail**: extend the `rag` case in `FlowCanvas.readoutFor` and
  `InspectorPanel.renderDetail` to show ingestion (chunking strategy, token counts, model/
  dim/preview, stored count).
- [x] **T15 — i18n**: add all new `chat`/`readout`/`inspector` strings in en **and** pt
  (`strings.ts`). (§4)
- [x] **T16 — api client + store**: `lib/chatApi.ts` (sessions/messages/documents + SSE
  upload); `streamChat`/`batchChat` take `session_id`; `store/useChat.ts` (sessions, active
  session, messages, documents, list↔thread view). Chat send + upload feed `useSimulator.events`
  so the canvas animates.
- [x] **T17 — chat UI**: rebuild `ChatPanel.tsx` into the conversation list ↔ thread (D9):
  message bubbles with persisted RAG chunks highlighted (D5), input, New chat / Clear /
  Upload PDF, document list + remove. Wire into `App.tsx` left sidebar.
- [x] **T18 — FE tests**: add/adjust Vitest coverage where it's cheap (e.g. a chunk-highlight
  render or store reducer); keep `npm test` green.

## Phase 7 — Verify & refactor

- [x] **T19 — refactor**: clean up; keep all tests green.
- [x] **T20 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (with `OPENAI_API_KEY`)
  · `npm run build` · `npm test`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean
- [x] `pytest -q` green (with `OPENAI_API_KEY`, per `003-openai-only`)
- [x] `npm run build` + `npm test` pass
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), every Stage mapped to a station
      (the three ingest stages → `rag`)
- [x] All new user-facing text exists in en **and** pt
- [x] `003-openai-only` landed (no demo assumptions remain)
- [x] `spec.md` status updated to `done`
