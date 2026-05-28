# Tasks: Message attachments — uploaded files travel with the message that introduced them

> Ordered TDD checklist. Each implementation task is preceded by a failing test
> (red → green → refactor). Reference: `spec.md` (AC1–AC12) + `plan.md`.

## Tasks

### Backend — relational join + write path (AC2, AC3, AC4, AC12)

- [x] **T1 — test first**: in `backend/tests/test_db.py`, add
  `test_message_documents_round_trip` covering: a message written with
  `attached_document_ids=[d1, d2]` returns `documents` in insertion order from
  `list_messages`; a message written without the param returns `documents: []`.
  (AC2)
- [x] **T2 — implement T1**: in `backend/app/db/store.py`:
  - add `message_documents` to `_SCHEMA` (PK on `(message_id, document_id)`,
    FK CASCADE both sides, `created_at` REAL, two indexes);
  - extend `_write_message_sync` to accept `attached_document_ids` and INSERT
    per id inside the same connection-level transaction;
  - extend `_list_messages_sync` to load `documents` per message in one extra
    JOIN query, defaulting to `[]`;
  - expose `attached_document_ids` on the async `write_message`.
- [x] **T3 — test first**: add `test_cross_session_document_ids_are_filtered`
  — write a message in s1 with `[d1∈s1, d2∈s2]` → `documents == [d1]`, no
  exception. (AC3)
- [x] **T4 — implement T3**: filter the INSERT loop by `SELECT 1 FROM documents
  WHERE id = ? AND session_id = ?`. Silent skip on miss.
- [x] **T5 — test first**: add `test_document_attaches_to_at_most_one_message`
  — link d1 to m1 (write m1 with attach); write m2 with attach=[d1]; assert
  m1.documents == [d1] and m2.documents == []. (AC4)
- [x] **T6 — implement T5**: before INSERT, `SELECT 1 FROM message_documents
  WHERE document_id = ?`; if already linked, skip. PK is belt-and-braces.

### Backend — request schema + REST surface (AC5, AC6)

- [x] **T9 — test first**: in `backend/tests/test_api.py`, add
  `test_chat_request_attaches_documents_in_batch_mode` — drive a batch-mode
  request with `attachment_document_ids=[d1]` (after `add_document` for d1),
  assert `list_messages(sid)[-1]["documents"] == [d1]`. Keyless via the
  existing test agent stub. (AC5)
- [x] **T10 — implement T9**: in `backend/app/schemas.py`, add
  `attachment_document_ids: list[str] | None = Field(default=None, max_length=16)`
  to `ChatRequest`. In `backend/app/main.py`, pass it into `write_message` on
  the `db.write` span.
- [x] **T11 — test first**: add `test_list_messages_returns_documents_field`
  — pre-existing message → `documents: []`; attached message → populated. (AC6)
- [x] **T12 — verify**: covered by T2; just ensure the REST shape (no Pydantic
  re-wrap) carries the list through. Add the explicit assertion on the GET.

### Frontend — pending attachments + send snapshot (AC1, AC9)

- [x] **T13 — test first**: in `frontend/src/store/useChat.test.ts`, extend
  with `test "send clears pending attachments and input"` (AC1) — seed
  `pendingDocuments`, call `send()`, await resolve, assert both are empty.
- [x] **T14 — implement T13**: in `frontend/src/store/useChat.ts`:
  - rename `documents` → `pendingDocuments` in the state and selectors;
  - update `uploadPdf` to append the just-uploaded `DocumentMeta` to
    `pendingDocuments` (no `listDocuments` refetch);
  - update `removeDocument` to call DELETE and on success splice the entry out
    of `pendingDocuments`;
  - update `send()` to: (a) snapshot `pendingDocuments` into a local const
    *before* any await, (b) clear it synchronously (`set({pendingDocuments:
    []})`), (c) forward the snapshot ids to `streamChat`/`batchChat` as
    `attachmentDocumentIds`;
  - update `openSession`/`newChat`/`clearAll` to reset `pendingDocuments`.
- [x] **T15 — test first**: add `test "upload during in-flight send queues
  for next turn"` (AC9) — install a `streamChat` stub that resolves after a
  `flushPromises`; call `send()`; before it resolves, call `uploadPdf` with a
  stub; after `send()` resolves, assert the first send's outgoing
  `attachmentDocumentIds` is the snapshot, and `pendingDocuments` now contains
  only the *post-send* upload.
- [x] **T16 — implement T15**: confirmed by T14's snapshot-then-clear order.
  Adjust the streamChat/batchChat shims in `lib/sse.ts` to thread the new
  option through the JSON body (one param each).
- [x] **T17 — implement (transport)**: update `frontend/src/lib/chatApi.ts`
  `ChatMessage` shape to include `documents: DocumentMeta[]`. No new fetch
  helper — `listMessages` already returns the message rows.

### Frontend — rendering the chip row on the user bubble (AC7, AC8 FE side)

- [x] **T18 — test first**: create
  `frontend/src/components/ChatPanel.attachments.test.tsx` (React Testing
  Library) covering:
  - given a `ChatMessage` with two `documents`, the rendered user bubble has
    two chips with the filenames and no `aria-label`-bearing remove button;
  - given `documents: []`, no chip row is rendered;
  - the composer's pending chip exposes a remove button (X). (AC7 + AC8 FE)
- [x] **T19 — implement T18**: in `frontend/src/components/ChatPanel.tsx`:
  - add `MessageAttachmentChip` (mirrors `DocChip` minus the X);
  - thread `documents` through `Exchange` → `UserMessage`; render the chip row
    above the bubble when non-empty (right-aligned to match the bubble lane);
  - in the in-flight `pending` block, also pass the just-snapshotted ids
    rendered as chips (so the optimistic bubble matches the post-send one);
  - add the bilingual hint line above the composer chips when
    `pendingDocuments.length > 0`.

### i18n (AC10)

- [x] **T20 — test first**: in `frontend/src/i18n/strings.test.ts`, extend the
  parity block asserting non-empty en + pt for the two new keys:
  `chat.pendingAttachmentsHint`, `chat.attachedToThisMessage`.
- [x] **T21 — implement T20**: add the keys to `frontend/src/i18n/strings.ts`
  with the copy from `plan.md`; reuse `chat.attachDoc` / `chat.removeDoc` for
  the existing aria labels.

### Gates (AC11)

- [x] **T22 — backend gates**: `ruff check .` clean; `ruff format .`; `pytest
  -q` green (includes the new keyless tests T1, T3, T5, T9, T11).
- [x] **T23 — frontend gates**: `npm run build` green (`tsc --noEmit` + Vite
  build); `npx vitest run` all-pass (T13, T15, T18, T20).
- [x] **T24 — exhaustiveness sanity**: confirm no `Stage` was added — the
  existing `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity tests stay green
  without edits.
- [ ] **T25 — manual verify**: launch the app, upload a PDF, send a message,
  confirm chip moves from composer to the user bubble; reload the conversation,
  confirm the chip is still on that message; upload mid-send, confirm the new
  chip queues for the next turn. *(Deferred to the user — automated gates
  green, but the chip-moves-to-bubble UX is best confirmed by eye.)*
- [x] **T26 — spec status & memory**: flip `spec.md` Status from `clarified` →
  `in-progress` → `done` as work lands; add a `MEMORY.md` entry for
  [[spec-040-message-attachments]] when done.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
  (T1→AC2, T3→AC3, T5→AC4, T9→AC5, T11→AC6, T13→AC1, T15→AC9,
  T18→AC7/AC8 FE, T20→AC10, T22+T23+T24→AC11).
- [x] `ruff check .` clean
- [x] `pytest -q` green
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npx vitest run` all-pass
- [x] No protocol drift: `schemas.py` ↔ `events.ts` unchanged for `TraceEvent`
  and `Stage`; `ChatRequest` / `ChatMessage` mirror confirmed BE→FE
- [x] Every Stage still mapped to a station (no `Stage` added; sanity
  re-confirm via the existing exhaustiveness test)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
