# Plan: Clear databases — reset control in Settings

> The HOW. Written after `spec.md` is `clarified`. Decisions here respect every principle in
> `.specify/constitution.md`.

## Approach

One small **maintenance endpoint** that clears both stores, mirrored by a thin API helper, a
store action, and a Settings section.

- **Relational store** (`ConversationStore`): a new `clear_all()` that counts the rows it is
  about to remove, then deletes all `sessions` (FK `ON DELETE CASCADE` + per-connection
  `PRAGMA foreign_keys = ON` already drop the dependent `messages`/`documents`), returning the
  three counts. Runs in the existing `asyncio.to_thread` worker like every other store method.
- **Vector store**: a new `delete_uploaded_vectors()` in `rag/ingestion.py`, a direct sibling
  of the existing `delete_document_vectors()` — it selects `where={"corpus": False}`, deletes
  those ids, and returns the count. The corpus (`corpus=true`) is never touched, so retrieval
  keeps working with **no rebuild** (the cheaper, user-chosen option).
- **Endpoint** `POST /api/data/clear`: clears the vectors (off-thread) and the relational rows,
  returns the merged counts `{ sessions_deleted, messages_deleted, documents_deleted,
  vectors_removed }`. `POST` (a command on the data, returning a summary) rather than `DELETE`,
  since it acts across both stores and reports what it did.
- **Frontend**: `clearData()` in `chatApi.ts`; a `clearAll()` action in `useChat` that calls it
  once and then resets to a clean draft (empty `sessions`, `newChat()` for a blank thread +
  visualizer reset); a **Data** section in `SettingsPanel` with an inline confirm gate
  (local `confirming` state) and a brief result line built from the returned counts.

Alternative considered: wiping the whole collection and rebuilding the corpus on every clear —
rejected as slower and needlessly destructive of the built-in KB (the user chose "imported
chunks only"). Also considered a browser `confirm()` dialog — rejected for an inline confirm
that matches the panel's styling and is keyboard/escape friendly like the rest of the panel.

## Affected files

**Backend**
- `backend/app/db/store.py` — add `_clear_all_sync()` (count, then `DELETE FROM sessions`) and
  the `async clear_all()` wrapper; returns `{sessions_deleted, messages_deleted,
  documents_deleted}`.
- `backend/app/rag/ingestion.py` — add `delete_uploaded_vectors() -> int` (mirror of
  `delete_document_vectors`, filtering `where={"corpus": False}`).
- `backend/app/main.py` — add `POST /api/data/clear`; import `delete_uploaded_vectors`.

**Frontend**
- `frontend/src/lib/chatApi.ts` — `ClearResult` interface + `clearData()` POST helper.
- `frontend/src/store/useChat.ts` — add `clearAll: () => Promise<ClearResult | null>` to the
  interface and implement it (calls `clearData`, then `set({ sessions: [] })` + `newChat()`).
- `frontend/src/components/SettingsPanel.tsx` — new "Data" section: the **Clear databases**
  button with inline confirm/cancel and a transient result/clearing line.
- `frontend/src/i18n/strings.ts` — `settings.data` block (type + en + pt values).

**Tests**
- `backend/tests/test_clear.py` — AC1–AC4 (new file).
- `frontend/src/store/useChat.clear.test.ts` — AC5 (new file, mocks `chatApi`).
- `frontend/src/i18n/strings.test.ts` — extend for AC6 (`settings.data` en/pt parity).

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed; `schemas.py` ↔ `events.ts` mirror is
untouched; no new station/hop/tier; the `STAGE_TO_STATION` / `STAGE_TO_PHASE` exhaustive maps
are unaffected.

## Data model changes

No schema migration. The relational clear is plain `DELETE`s over the existing tables (cascade
handles `messages`/`documents`); the vector clear is a metadata-filtered `delete` over the
existing Chroma collection. No new columns, tables, or collections.

## i18n strings (constitution §4)

New `settings.data` block:

| key | en | pt |
|---|---|---|
| `settings.data.title` | Data | Dados |
| `settings.data.clear` | Clear databases | Limpar bancos de dados |
| `settings.data.clearHint` | Wipe all saved conversations and imported document chunks. The built-in knowledge base is kept. | Apaga todas as conversas salvas e os chunks de documentos importados. A base de conhecimento embutida é mantida. |
| `settings.data.confirm` | Clear all data? | Limpar todos os dados? |
| `settings.data.confirmHint` | Deletes every conversation and every uploaded chunk. This can't be undone. | Apaga todas as conversas e todos os chunks enviados. Isto não pode ser desfeito. |
| `settings.data.confirmYes` | Yes, clear | Sim, limpar |
| `settings.data.cancel` | Cancel | Cancelar |
| `settings.data.clearing` | Clearing… | Limpando… |
| `settings.data.cleared` | Cleared {sessions} conversations · {chunks} chunks | Limpou {sessions} conversas · {chunks} chunks |

`{sessions}`/`{chunks}` are interpolated in the component from the `ClearResult`
(`sessions_deleted` and `vectors_removed`). `cleared` is a template string, not split per count.

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | seed sessions+messages+documents → `clear_all()` → lists empty + counts match | `backend/tests/test_clear.py` |
| AC2 | index corpus + add `corpus=false` vectors → `delete_uploaded_vectors()` → uploads gone, corpus remains | `backend/tests/test_clear.py` |
| AC3 | `POST /api/data/clear` (TestClient) → 200 + 4 counts; `GET /api/sessions`==[] ; `GET /api/health` `indexed:true` | `backend/tests/test_clear.py` |
| AC4 | call clear on empty stores (and twice) → 200, all counts 0, no error | `backend/tests/test_clear.py` |
| AC5 | mock `chatApi.clearData`; populate store → `clearAll()` → API called once, store reset to draft | `frontend/src/store/useChat.clear.test.ts` |
| AC6 | `settings.data` leaf keys equal in en/pt and all non-empty | `frontend/src/i18n/strings.test.ts` |

AC2/AC3 are `@pytest.mark.openai` (they open the embedding-backed vector store, which needs a
key); AC1/AC4-relational run keyless. Backend assertions are structural (counts, membership,
`indexed`) to stay model-agnostic.

## Risks / trade-offs

- **Vector store needs a key.** `get_vectorstore()` builds the embedding function, which raises
  without `OPENAI_API_KEY`. The endpoint only runs in a real, keyed app (constitution §2:
  OpenAI required), and `delete_uploaded_vectors` is wrapped defensively (an empty/absent
  collection returns 0, like the existing `delete_document_vectors`).
- **`where={"corpus": False}` correctness.** Symmetric to `build_index`'s `where={"corpus":
  True}` and ingestion's `corpus=False` tagging; AC2 pins that the corpus survives and only
  uploads are removed, guarding against an accidental full wipe.
- **Single-instance assumption holds.** Both stores are process-local (SQLite file + on-disk
  Chroma); no cross-replica coordination needed — consistent with the app's single-instance
  design.
- **No undo.** Mitigated by the inline confirm gate; documented as final in the UI hint.
- **Concurrency** (clear during an in-flight run) is out of scope for a single-user tool; the
  worst case is a partial-trace turn whose `db.write` lands after the clear and re-creates one
  session row — acceptable and self-correcting on the next clear.
