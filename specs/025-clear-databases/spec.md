# Spec: Clear databases — reset control in Settings

| | |
|---|---|
| **ID** | 025-clear-databases |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The simulator deliberately runs two **real** databases side by side: a relational store
(`ConversationStore`, SQLite → managed SQL) that accumulates every conversation, message and
uploaded-document row, and a **vector** store (Chroma) that holds the built-in corpus *plus*
every chunk the user imports by uploading a PDF. There is today no way to wipe that
accumulated state from the UI. A presenter who has been demoing — many throwaway
conversations, several test PDFs imported into the vector store — has no clean "start over"
button. Deleting one conversation at a time is tedious, and it intentionally leaves uploaded
embeddings behind (D6), so the vector store only grows.

The ⚙️ Settings panel already hosts the architecture/experiment controls and is the natural home
for a single **"Clear databases"** action that resets both stores to a clean baseline — while
keeping the built-in knowledge base so the app still works for the next message.

## Goals

- Add a **"Clear databases"** control inside the ⚙️ Settings panel that, in one confirmed
  action, **(a)** wipes all relational history (every conversation, its messages and its
  document rows) and **(b)** removes every **user-imported** chunk from the vector store.
- **Preserve the built-in corpus** — the foundational knowledge base (`data/corpus/*.md`,
  tagged `corpus=true`) is kept, so retrieval still works immediately after a clear.
- Guard the destructive action with an **inline confirm step** (no accidental one-click wipe).
- After a successful clear, the UI **returns to a clean state**: empty conversation list, a
  fresh draft conversation, and the visualizer reset.
- All new user-facing text ships in **English and Portuguese** (constitution §4).

## Non-goals

- **No change to the event protocol, no new `Stage`/`Phase`/`TraceEvent`, no new canvas
  station/tier/hop.** This is a maintenance REST action plus a Settings control; the pipeline
  and the `stations.ts` model are untouched.
- **Not** clearing the built-in corpus vectors (they are kept) — and therefore no corpus
  rebuild is triggered by this action.
- **Not** clearing the in-memory `TraceStore` (ephemeral, bounded, lost on restart anyway) nor
  any browser-local preferences (theme, language, cloud, scenario, delivery mode).
- **Not** a per-conversation delete (that already exists via `DELETE /api/sessions/{id}`); this
  is the global "reset everything" companion.
- Not an undo / backup / export — a clear is final.

## User-facing behavior

In the ⚙️ Settings panel, below the existing experiment controls, a new **"Data"** section
shows a **"Clear databases"** button with a one-line explanation of what it removes and what it
keeps (the built-in knowledge base).

- The first click does **not** clear anything — it reveals an inline **confirm** state:
  a short warning ("Deletes all conversations and uploaded document chunks; the built-in
  knowledge base is kept.") with **"Yes, clear"** and **"Cancel"** buttons.
- **Cancel** dismisses the confirm state with no change. **Yes, clear** issues the request,
  shows a brief "Clearing…" state, and on success shows a short result line reporting what was
  removed (e.g. *"Cleared 7 conversations · 24 chunks"*).
- After a successful clear the conversation sidebar is empty, the app shows a fresh empty draft
  conversation, and the canvas/visualizer is reset.

All of the above prose exists in both **en** and **pt**.

## Acceptance criteria

1. **AC1 — Relational history is wiped** — Given the relational store holds ≥2 sessions, each
   with messages, and ≥1 document row, when `clear_all()` runs, then afterward the session
   list is empty (and so are every former session's messages/documents), and it returns
   `{ sessions_deleted, messages_deleted, documents_deleted }` whose values equal the seeded
   counts (all > 0).

2. **AC2 — Only imported vectors removed; corpus kept** — Given the built-in corpus is indexed
   **and** ≥1 user-imported document's vectors are present (`corpus=false`), when
   `delete_uploaded_vectors()` runs, then it returns the count of imported vectors removed,
   **every** `corpus=false` vector is gone, and **every** `corpus=true` corpus vector remains
   (a corpus retrieval still returns results / `is_indexed()` stays `true`).

3. **AC3 — Endpoint clears both stores and keeps the corpus** — Given seeded relational rows
   and imported vectors, when `POST /api/data/clear` is called, then it returns `200` with a
   body containing `sessions_deleted`, `messages_deleted`, `documents_deleted` and
   `vectors_removed`; and afterward `GET /api/sessions` returns `[]` while `GET /api/health`
   reports `indexed: true` (the corpus survived).

4. **AC4 — Safe and idempotent on empty stores** — Given empty stores (or a second consecutive
   call), when `POST /api/data/clear` is called, then it returns `200` with all four counts
   equal to `0` and raises no error.

5. **AC5 — Front-end reset after clear** — Given a populated chat store, when
   `useChat.clearAll()` resolves, then it calls the clear API exactly once and the store is
   reset to a fresh draft: `sessions === []`, `activeSessionId === null`, `messages === []`,
   `documents === []`, and the visualizer is reset.

6. **AC6 — Bilingual strings (§4)** — Given the new `settings.data` UI strings, then
   `UI.en.settings.data` and `UI.pt.settings.data` have **identical leaf keys** and every value
   is a **non-empty** string.

> The inline confirm gate (first click ⇒ confirm state, only the confirm action calls the API)
> is component-local UI state. The project has no React component-test harness (Vitest tests
> cover lib/store level), so the gate is exercised by AC5 (the store action that the confirm
> button fires) and verified by `tsc`/manual; it is not given its own automated test.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **none** (no pipeline change; this is a maintenance
  REST action plus a Settings control — it reads/clears the existing two stores, adds no node)

## Open questions (clarify before planning)

_All resolved (clarified with the user 2026-05-27):_

- [x] Vector-store scope on clear → **user-imported chunks only** (`corpus=false`); the built-in
  corpus is kept, so no rebuild is needed (vs. wiping everything + rebuilding, or wiping with no
  rebuild).
- [x] Relational scope → **all conversations** (a global reset), not just the active one.
- [x] Destructive-action guard → **inline confirm step** in the panel (vs. one-click, vs. a
  browser `confirm()` dialog).

## Out of scope / deferred

- Clearing the built-in corpus and/or re-ingesting it from the UI.
- Clearing the in-memory trace store, or exporting/backing-up data before a clear.
- A typed-confirmation ("type CLEAR") or per-store (relational-only / vector-only) toggles.
- Any concurrency handling for "clear while a run is in flight" — single-user educational tool.
