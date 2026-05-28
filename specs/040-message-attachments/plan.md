# Plan: Message attachments — uploaded files travel with the message that introduced them

> The HOW. Respects `.specify/constitution.md`: §1 (no `TraceEvent` protocol
> change), §3 (everything real — real join table, real REST payload), §6
> (`stations.ts` untouched — no `Stage` map drift), §9 (TDD), §4 (en+pt).

## Approach

The smallest persistent answer to *"which message introduced which file"* is a
**relational join** (`message_documents`) added next to the existing
`messages` and `documents` tables. The relational layer already owns the
*system-of-record* role for the chat (`ConversationStore`, §2 of CLAUDE.md), so
this stays inside its boundary — no protocol change, no extra `Stage`, no new
station.

The link is **populated at `db.write`**, from a new `attachment_document_ids`
field on `ChatRequest`. The frontend's composer maintains a **pending
attachments list** scoped to the *next* send (today's `documents` field is
repurposed — see below); on a successful send it flushes that list into the
request, then clears it locally. The persisted message gains a `documents: []`
array in `list_messages`, and the user bubble renders the chip row from it.

Alternatives considered and rejected:

1. **Visual-only, no persistence** — fails AC2 / AC6 (reload/replay loses the
   chips). Cheap but defeats the simulator's *"everything is real"* stance.
2. **`message_id` column on `documents`** — fewer tables, but couples
   deletion semantics (today, deleting a message must NOT cascade-delete the
   doc's vectors). A join keeps message-deletion (cascade clears links) and
   document-deletion (cascade clears links) symmetric and untangled.
3. **Time-window inference** (`docs created between prev_msg.ts and
   this_msg.ts`) — elegant but races with slow ingestion (a 5 s upload sent
   right after a 200 ms turn would attach to the wrong turn). Not reliable.
4. **Snapshot of all session docs at send-time** — fails the user's stated
   goal ("rastrear em qual mensagem ele foi carregado") because turn 2 would
   "own" turn 1's file too.

## Affected files

**Backend**
- `backend/app/db/store.py`
  - `_SCHEMA` gains `message_documents (message_id, document_id, PRIMARY KEY)`
    with FK cascades to both sides.
  - `_migrate()` no-op for this table (`CREATE TABLE IF NOT EXISTS` covers it);
    a one-line idempotent check is unnecessary.
  - `write_message(..., attached_document_ids: list[str] | None = None)` —
    after the existing `INSERT OR REPLACE INTO messages`, insert one
    `message_documents` row per id that is (a) a doc in this session and (b)
    not already linked. The whole write runs inside a single connection-level
    transaction (same `with self._connect()` block).
  - `_list_messages_sync` JOIN-loads `documents` per message in one extra
    query: `SELECT md.message_id, d.id, d.filename, d.chunk_count, d.created_at
    FROM message_documents md JOIN documents d ON d.id = md.document_id
    WHERE md.message_id IN (...) ORDER BY md.rowid`. Group by message_id in
    Python; default to `[]`.
  - Public async `write_message` signature gains `attached_document_ids`.
- `backend/app/schemas.py` — `ChatRequest` gains
  `attachment_document_ids: list[str] | None = Field(default=None, max_length=16)`
  (Pydantic v2: `max_length` on the list).
- `backend/app/main.py` — the `POST /api/chat` `db.write` span passes
  `attached_document_ids=req.attachment_document_ids` to `write_message`. No
  emitter-level event change.

**Frontend**
- `frontend/src/lib/chatApi.ts`
  - `ChatMessage` gains `documents: DocumentMeta[]` (mirrors AC6).
  - `streamChat`/`batchChat` (in `lib/sse.ts`) start accepting an
    `attachmentDocumentIds: string[]` option threaded into the POST body.
- `frontend/src/lib/sse.ts` — both `streamChat` and `batchChat` thread the new
  option into the JSON body (one new param each).
- `frontend/src/store/useChat.ts`
  - Rename `documents` → `pendingDocuments` (transient pending-attachment list,
    scoped to the next send). `uploadPdf` appends the just-uploaded doc to
    `pendingDocuments` *instead of* refetching the whole session list.
  - `removeDocument` still calls `DELETE /api/sessions/{sid}/documents/{id}`
    and on success removes the entry from `pendingDocuments`. Behavior
    parity preserved (AC8).
  - `send()` — snapshot `pendingDocuments` into a local `const`, clear it
    synchronously *before* the network call (so a doc uploaded mid-send queues
    for the next turn — AC9), forward the snapshot ids to `streamChat` /
    `batchChat` as `attachmentDocumentIds`.
  - On `openSession`, `pendingDocuments` is cleared (the session's docs live
    on past messages now; the composer is for *new* attachments only).
- `frontend/src/components/ChatPanel.tsx`
  - `Composer` reads `pendingDocuments` (same chip strip with X, unchanged
    visually); add the bilingual hint line above the chips when non-empty.
  - `UserMessage` gains an optional `documents?: DocumentMeta[]` prop; when
    non-empty, renders a `<MessageAttachmentChip>` row *above* the bubble,
    right-aligned (same lane as the bubble). The chip mirrors `DocChip` but
    **without** the X / `onRemove`.
  - `Exchange` and the in-flight `pending` block pass `message.documents` into
    `UserMessage`. The in-flight bubble (optimistic render) passes the
    snapshot captured at send time — see store change.
- `frontend/src/i18n/strings.ts` — new keys under `chat`:
  - `pendingAttachmentsHint` — composer hint.
  - `attachedToThisMessage` — chip tooltip on the message bubble.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `ChatRequest.attachment_document_ids` is a
  **request schema** addition (not a `TraceEvent`). `TraceEvent` and `Stage`
  are untouched.
- `frontend/src/types/events.ts` — no change required (no new event shape).
- Emitted in: **n/a.** No new event.
- `stations.ts` / `STAGE_TO_STATION` / `STAGE_TO_PHASE` — **unchanged.** No
  `Stage` added or removed; both maps stay total.
- `readoutFor` (FlowCanvas) / `renderDetail` (InspectorPanel) — **unchanged.**

## Data model changes

**Relational store (`ConversationStore`).** New join table:

```sql
CREATE TABLE IF NOT EXISTS message_documents (
    message_id  TEXT NOT NULL REFERENCES messages(id)  ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at  REAL NOT NULL,
    PRIMARY KEY (message_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_message_documents_message  ON message_documents(message_id);
CREATE INDEX IF NOT EXISTS idx_message_documents_document ON message_documents(document_id);
```

`PRIMARY KEY (message_id, document_id)` makes "attach twice" an idempotent
no-op (AC4: re-linking d1 to a second message is rejected by application code
since the doc is already linked to m1 — we check first; the PK is belt-and-
braces).

**No migration story.** The user wipes the SQLite DB before adopting this
spec, so the join table is created cleanly by the standard `CREATE TABLE IF
NOT EXISTS` bootstrap. No `ALTER`, no backfill, no pre-spec compatibility
test.

**Vector store (Chroma).** Untouched. Per-message attachment is metadata about
ingestion provenance, not a retrieval filter (the agent still retrieves
session-wide, AC of *no goal change to retrieval*).

**Clear-all (025).** No new counter, but the new join table is wiped by the FK
cascade when sessions/documents/messages are deleted. The `_clear_all_sync`
sequence already removes documents and messages, so the join is emptied as a
side-effect (FKs enabled per connection). No new counter is needed because the
join is metadata about already-counted rows.

## i18n strings (constitution §4)

| key (`chat.*`) | en | pt |
|---|---|---|
| `pendingAttachmentsHint` | `Pending attachments — will travel with your next message.` | `Anexos pendentes — vão junto com sua próxima mensagem.` |
| `attachedToThisMessage` | `Attached to this message` | `Anexado a esta mensagem` |

(Reuses `chat.attachDoc`, `chat.removeDoc`, `chat.chunksStored` and the
existing `DocChip` filename rendering.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary/hop. The join table sits inside the existing
`database` tier (Azure SQL / Amazon RDS / Cloud SQL — already mapped on the
`database` station).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | After `send()` resolves, `useChat.getState().pendingDocuments === []` and `input === ""` | `frontend/src/store/useChat.test.ts` (extend) |
| AC2 | `write_message(..., attached_document_ids=[d1,d2])` then `list_messages(sid)[0].documents` matches insertion order; without param → `[]` | `backend/tests/test_db.py` (new test) |
| AC3 | Cross-session id is silently filtered (no exception, m has only the in-session doc) | `backend/tests/test_db.py` (new test) |
| AC4 | Linking the same doc to a second message is a no-op (m1 keeps it, m2.documents == []) | `backend/tests/test_db.py` (new test) |
| AC5 | `POST /api/chat` with `attachment_document_ids=[d1]` (sync mode) → `list_messages(sid)[-1].documents == [d1]` | `backend/tests/test_api.py` (new keyless test, batch mode + stubbed agent) |
| AC6 | `GET /api/sessions/{sid}/messages` returns `documents: []` for a pre-attach message, populated for an attached one | `backend/tests/test_api.py` (new test) |
| AC7 | Render `<UserMessage documents=[…]>` → chip row exists, no X; `documents=[]` → no chip row | `frontend/src/components/ChatPanel.attachments.test.tsx` (new RTL test) |
| AC8 | `DELETE /api/sessions/{sid}/documents/{id}` still wipes vectors+object+row (existing test stays green); FE: X is absent on message chips, present on composer chips | reuse `test_api.py::test_delete_document` + new RTL assertion |
| AC9 | An upload after `pendingDocuments` was snapshotted (during send) appends to the *next* send's pending list, not the current | `frontend/src/store/useChat.test.ts` (new test, with deferred `streamChat` resolve) |
| AC10 | en/pt parity for the 2 new keys (non-empty) | `frontend/src/i18n/strings.test.ts` (extend parity block) |
| AC11 | `tsc --noEmit` + existing `STAGE_TO_STATION` / `STAGE_TO_PHASE` exhaustiveness tests stay green | CI gate (no new test) |

Tests assert **structurally** (set/length comparisons, presence/absence of
chips by role/aria); no model output is asserted, no `OPENAI_API_KEY` is
required for any test in this spec.

## Risks / trade-offs

- **Snapshot vs. live pending list.** Snapshotting `pendingDocuments` at the
  *call* of `send()` (before any awaits) avoids the race where an upload
  finishing mid-send would otherwise smear across two turns (AC9). Documented
  in `useChat.send` and tested with a deferred SSE handler.
- **`documents` field on `ChatMessage` is additive.** Older replay traces and
  the existing `Exchange` rendering keep working; the chip row is conditional
  on `documents.length > 0`.
- **FK cascade on `documents`.** Today, deleting a document leaves the message
  intact but removes the doc from the chat-API document list. After this spec,
  deleting a document also drops its `message_documents` row (FK cascade), so
  the chip vanishes from the message bubble too — desirable: the message bubble
  shouldn't carry a chip for a deleted file. Tested as part of AC8.
- **Pre-existing data.** Out of scope — the user wipes the SQLite DB before
  adopting this spec, so there is no message↔upload history to reconcile and
  no graceful-degradation path to maintain.
- **List-cap (16).** Bounds the request size; chosen as a comfortable ceiling
  above any realistic chip strip. Hardcoded with a comment; not exposed.
- **Single-instance.** Same store, same connection model; no shared state
  across replicas (consistent with §7 of the constitution).
