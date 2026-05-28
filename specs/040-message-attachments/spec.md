# Spec: Message attachments — uploaded files travel with the message that introduced them

| | |
|---|---|
| **ID** | 040-message-attachments |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> The HOW is in `plan.md`. This spec moves uploaded-document affordance from the
> composer (session-sticky) onto the **specific user message** the upload was
> attached to, so the conversation transcript honestly records *which turn*
> introduced *which file*.

## Problem / motivation

Today, uploaded PDFs are session-scoped: after `uploadPdf` the doc chip sits in
the composer (`Composer` renders `documents` from the session) and stays there
for every subsequent send until the user clicks ⛌. The screenshot the user
reported shows the exact bug — they sent *"Sobre qual curso fala esse doc?"*,
the agent answered, and the `ciência da computação.pdf` chip is still in the
input box as if waiting to be re-attached, while no chip appears on the user
message it actually belonged to.

This is misleading on two axes:

- **Visual:** the chip's place is *in the composer* (a draft area), which reads
  as *"still pending"*. A learner can't tell whether the file went out with the
  message or not.
- **Auditable:** there is no way — in the persisted transcript or on
  replay — to trace *which message* introduced *which document*. Open the
  conversation tomorrow and the chips are gone or look detached from the turn
  that uploaded them.

The simulator's whole point is to **make the lifecycle visible**: an upload is
a real event that belongs to a real turn. So the attachment must travel with
the message and survive reload/replay, like the retrieved chunks and the
applied skills already do (`message.chunks`, `message.skills`).

## Goals

- After a successful send, the composer's attachment area is **empty** — chips
  *move* to the just-sent user message.
- The persisted user message gains a **`documents: []`** field listing the
  files it carried, surviving reload/replay (same pattern as `chunks` and
  `skills`, persisted server-side).
- Each chip on a message shows enough to identify the file (filename + chunk
  count, like today) and a hover/title makes the source unambiguous.
- A single document is **attached to exactly one message** (the turn that
  introduced it), even though the underlying vectors remain queryable
  session-wide for subsequent turns (the agent can still RAG over it later).
- Bilingual: all new prose ships en + pt.
- Degrades gracefully: pre-existing messages (no attachment join) still render
  (the new chip row is conditional, no crash).

## Non-goals

- **No new `Stage`, station, hop or tier.** The upload flow already has its
  own stages (`storage.upload`, `ingest.*`); this spec only changes the
  *persistence and rendering of the document↔message link*, not the lifecycle.
- No **multi-attach a doc across messages**: a doc belongs to one user message
  (the one whose composer carried it at send). Re-uploading the same file
  produces a new document_id and a new attachment.
- No **document manager panel** for the whole session — the only places docs
  surface are (a) pending in the composer before send, and (b) on the message
  they were attached to.
- No change to **retrieval semantics**: once ingested, the doc's chunks are
  queryable for the rest of the session (today's behavior), regardless of which
  message carries the chip.
- **No backwards compatibility with old data.** The user wipes the SQLite DB
  before adopting this spec, so we do not engineer a backfill path or a
  "pre-spec message renders without chips" affordance. Schema bootstrap uses
  `CREATE TABLE IF NOT EXISTS` (codebase convention), but no test pins
  pre-spec compatibility.
- No turn-by-turn document **diff** view; no per-message "remove attachment
  after send" affordance.

## User-facing behavior

**Composer area.** A *pending attachments* drawer (the same chip strip as today)
sits above the textarea. The attach button (📎) adds files to this list as it
does now (each upload streams its ingestion trace on the canvas, unchanged).
The X on a pending chip removes the file (and its vectors + stored blob — the
current `removeDocument` path, unchanged) while the user is still drafting.

On a successful **send**, the pending attachments list is **cleared
synchronously**; the just-sent user bubble is rendered with a chip row carrying
exactly those files. Subsequent messages in the same conversation start with an
empty pending list. A *new* upload in turn 3 attaches only to turn 3, even
though turn 1's PDF is still indexed and the agent may retrieve from it.

**User message bubble.** When `message.documents` is non-empty, a chip row
appears **above** the bubble text (right-aligned, same lane as the bubble),
each chip showing `📄 filename  ·  N chunks` and titling the original filename:

```
                          [📄 ciência-da-comp.pdf · 4]
                          Sobre qual curso fala esse doc?
                                                     09:14 AM
```

The X is **absent** on a sent-message chip (the file was committed; removal is
not in-spec). Clicking the chip is a no-op (future scope: open a sources view).

**Replay & reload.** Opening a conversation, switching sessions, or replaying
a turn (022) shows the same chip row — it comes from the persisted
`message.documents`, not from any ephemeral client state.

**Composer placeholder & label.** Unchanged for the textarea. The chip strip
shows "Pending attachments — will travel with your next message" (en) / pt
equivalent — a quiet inline hint above the chips so the new semantics are
explicit on first encounter.

## Acceptance criteria

> Tests use the existing keyless patterns (`tmp_path` for DB, MSW/handler stubs
> for FE) so they run without `OPENAI_API_KEY`. No new `Stage` is added, so the
> exhaustiveness tests (`STAGE_TO_STATION`, `STAGE_TO_PHASE`) remain green
> without change.

1. **AC1 — Pending attachments are cleared on send (FE, keyless).** Given a
   conversation whose store has a non-empty `pendingDocuments` list and a
   non-empty `input`, when `send()` completes successfully, the store's
   `pendingDocuments` is `[]`. The textarea is also cleared (today's behavior;
   pinned as a regression test).
2. **AC2 — A message can carry a documents list (BE, keyless).**
   `ConversationStore.write_message(..., attached_document_ids=[d1, d2])` then
   `list_messages(sid)` returns the message with
   `documents: [{document_id, filename, chunk_count, created_at}, …]` in
   insertion order, populated from the join. Writing without
   `attached_document_ids` yields `documents: []`.
3. **AC3 — Only ids belonging to the session attach (BE, keyless).** Given two
   sessions s1 and s2 with documents d1∈s1 and d2∈s2, writing a message in s1
   with `attached_document_ids=[d1, d2]` attaches only `d1`. No exception is
   raised; `d2` is silently filtered (a stale client should not 5xx the chat
   round-trip).
4. **AC4 — A document attaches to at most one message (BE, keyless).** If d1 is
   already linked to m1, writing a new message m2 in the same session with
   `attached_document_ids=[d1]` is a no-op for that link (m1 keeps it; m2 gets
   no chip). The upload flow always mints a fresh `document_id`, so this only
   fires on misuse; the constraint prevents the chip from appearing on two
   turns simultaneously.
5. **AC5 — `ChatRequest` carries the attachment ids (BE, keyless).**
   `ChatRequest.attachment_document_ids: list[str] | None` is accepted by
   `POST /api/chat`; on `db.write`, the message is persisted with those ids
   (filtered per AC3). Omitting the field reproduces today's behavior (no
   attachments). Bounded to a reasonable list length to keep request size
   sane (cap: 16).
6. **AC6 — `ChatMessage` API surfaces `documents` (BE, keyless).**
   `GET /api/sessions/{sid}/messages` returns each message with
   `documents: DocumentMeta[]`. A pre-existing message without any join rows
   returns `documents: []`.
7. **AC7 — User bubble renders the chip row (FE, keyless).** Given a
   `ChatMessage` with two `documents`, the `UserMessage` component renders a
   chip row above the bubble with both filenames, both chunk counts, and **no
   remove (X) control**. Given an empty `documents`, no chip row is rendered.
8. **AC8 — `removeDocument` on a pending chip still wipes vectors + object
   (BE side reused).** Behavior of `DELETE /api/sessions/{sid}/documents/{id}`
   is unchanged — vectors removed, object removed, row removed. The FE only
   exposes this control on **pending** chips (composer), not on attached
   chips. (Test: the X is absent on attached chips; present on pending chips.)
9. **AC9 — Send-time snapshot is atomic (FE store).** If the user uploads doc
   d1, then sends, then uploads d2 *while the previous send is in flight*, the
   in-flight send carries only `[d1]`; d2 remains pending for the *next* send
   (composer chips and store state agree). The attach button stays disabled
   while `uploading`, unchanged from today.
10. **AC10 — Bilingual (§4).** The composer hint
    ("Pending attachments — will travel with your next message"), the
    attached-chip tooltip ("Attached to this message" / pt), and any new aria
    labels have non-empty en **and** pt.
11. **AC11 — TypeScript clean & no protocol drift.** `tsc --noEmit` is green;
    `ChatMessage` in `frontend/src/lib/chatApi.ts` mirrors the BE shape;
    `STAGE_TO_STATION` / `STAGE_TO_PHASE` are unchanged (no new `Stage`).

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.** No new event fields. The pre-existing
  `db.write` END `data` continues to carry the same shape — the documents link
  is a relational write inside that span, not a protocol-visible signal.
- Mirror in `frontend/src/types/events.ts`: **n/a.**
- Station mapping (`stations.ts`): **unchanged.** The persistence happens
  inside the existing `database` station's `db.write` stage; ingestion still
  fires on upload and is unrelated to attachment.
- Surface changes (not protocol):
  - `ChatRequest` adds `attachment_document_ids: list[str] | None` (request
    schema, not a `TraceEvent`).
  - `ChatMessage` (REST response) adds `documents: DocumentMeta[]` (mirrored
    in `frontend/src/lib/chatApi.ts`).

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Per-message join vs session snapshot vs visual-only?** → **Hybrid
  persisted snapshot** (per-message join table). The chips need to survive
  reload/replay and be auditable, which a visual-only client-side memory can't
  guarantee; a session-wide snapshot can't answer "which message introduced
  this file." A join table is the smallest persistent answer.
- [x] **Pending chips after send: linger or clear?** → **Clear from composer.**
  The chip *moves* to the user bubble; the composer goes back to a fresh state.
  This matches the user's reported expectation and keeps the lesson sharp
  ("upload belongs to a turn").
- [x] **Removing an attached chip after send?** → **Not in scope.** The
  composer X remains; the message-bubble chip has no X. Deletion of the
  underlying document remains possible via the existing API (and a future
  Document Manager spec can wire a UI for it).
- [x] **Backfill historical messages?** → **N/A.** The user wipes the SQLite
  DB before adopting this spec, so there are no historical messages to
  reconcile. The join table appears on first startup via the standard
  `CREATE TABLE IF NOT EXISTS` bootstrap.
- [x] **Does the agent still retrieve from earlier-turn uploads?** → **Yes.**
  Retrieval is session-scoped (Chroma metadata filter is by session, not by
  message), unchanged. The chip is a label about *who introduced* the file,
  not a gate on retrieval.
- [x] **Cap on pending attachments per turn?** → **16.** Bounds the request
  size + the chip-strip overflow; far above any realistic use.

## Out of scope / deferred

- A document manager panel listing every PDF in the session with per-doc
  metrics. Useful but a separate spec; today the user can already see them on
  the messages they were introduced on, and can remove them at upload time.
- Showing on the agent message which uploaded chunks contributed (already
  partially solved by the `from doc` badge on `Sources`, AC inherited from
  019-inline-citations).
- Drag-and-drop of pending chips between in-flight drafts; multi-turn
  attachment of the same physical file.
- A `Stage.ATTACH` event or any protocol-visible signal for attachment — the
  link is relational metadata, not part of the executable lifecycle.
- Showing pending chips while the previous run is still streaming (AC9 fixes
  the snapshot semantics; UX of a "queued next turn" is not in scope).
