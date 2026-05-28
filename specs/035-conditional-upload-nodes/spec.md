# Spec: Reveal Storage + Ingestion only during an upload

| | |
|---|---|
| **ID** | 035-conditional-upload-nodes |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Status: **done** (full TDD; 305 Vitest pass, `tsc`/`vite build` green; no backend change).
> Resolved (clarify): **pure projection** trigger — the two upload-write-path nodes are
> hidden by default and appear when the current event log shows an upload. No new state.

## Problem / motivation

Spec 033 added the **Ingestion** node and spec 034 added **Object Storage** — both
always-visible in every scenario. That grew the AI & Data Services column from 4 nodes to
6, and on a normal chat (which never touches the write-path) the canvas now reads as
crowded and the column runs off-screen. The two nodes only matter when the user **uploads a
document**; the rest of the time they are dead weight that pushes the query-path nodes
(RAG, MCP, LLM) down and shrinks the usable canvas.

## Goals

- **Storage** and **Ingestion** (and their three hops — `backend → storage`,
  `backend → ingestion`, `ingestion → rag`) are **hidden by default** and **revealed only
  when the current trace shows an upload** (a `storage.upload` or any `rag.ingest.*` event).
- This is a **pure projection** of the event log — no new store state, no toggle: live
  upload, step, and replay all reveal them through the same derivation, and a plain chat
  (or the idle/empty canvas) hides them again.
- The query path is unchanged and less crowded: with no upload, the data column shows
  exactly today's four query-path nodes (database, rag, mcp, llm); the layout reflows so
  nothing runs off-screen.
- Applies in **every scenario** (wherever the two nodes already appear).
- No protocol change, no new `Stage`, no new user-facing text.

## Non-goals

- No change to **what** the nodes do or to the upload pipeline itself (034 stands).
- No manual show/hide control, and no session-document "stickiness" (the two rejected
  trigger options) — visibility follows the event log only.
- No change to the inspector content of either node, nor to `deriveView`'s station/`Stage`
  model (it stays total over `StationId`; hidden simply means "not rendered").

## User-facing behavior

On the simulator canvas:

- **Idle / plain chat:** the AI & Data Services column shows **App Database · RAG · Vector
  DB · MCP Tools · LLM** — Storage and Ingestion are absent, and their hops are absent.
- **PDF upload (live or replayed):** as soon as the trace carries the upload, **Object
  Storage** and **Ingestion / Indexer** appear in the column (Storage above Ingestion above
  RAG) with the three write-path hops, and animate as today. Stepping/replaying that trace
  keeps them visible for the whole trace (stable — no mid-replay reflow).
- Switching back to a chat trace hides them again.

The inspector **Overview** (station catalog) matches the canvas: the two nodes are listed
only when an upload is in scope, so clicking a listed node never targets something off-canvas.

No new strings; nothing to translate.

## Acceptance criteria

> All pure-projection FE tests (Vitest) — no `[openai]` needed.

1. **AC1 — Hidden by default.** With no upload in scope, `visibleStationIdsFor("simple")`
   equals the always-on set `frontend, backend, agent, database, rag, mcp, llm` and
   **excludes** `storage` and `ingestion`.
2. **AC2 — Revealed on upload.** With the upload flag set, `visibleStationIdsFor("simple",
   true)` additionally includes `storage` and `ingestion`.
3. **AC3 — Hops follow the nodes.** `visibleHopsFor` excludes `backend→storage`,
   `backend→ingestion`, `ingestion→rag` by default and includes all three when the upload
   flag is set; the non-upload hops are unaffected in both cases.
4. **AC4 — `hasUploadActivity` is a correct projection.** It returns `true` iff the event
   list contains a `storage.upload` or any `rag.ingest.*` event; `false` for a plain-chat
   log and for `[]`.
5. **AC5 — Layout reflows.** `computeLayout(expanded, scenario)` (no upload) lays out the
   data column without `storage`/`ingestion` (the services tier box is shorter, no
   overlap); `computeLayout(expanded, scenario, true)` includes them stacked
   storage→ingestion→rag as in 034.
6. **AC6 — Canvas drives it from the log.** `FlowCanvas` (and the inspector Overview)
   compute the upload flag from the store's events via `hasUploadActivity`, so a real upload
   reveals the nodes and a plain chat hides them — no extra request, no new state.
7. **AC7 — Ladder + previews intact.** The cumulative invariant (simple ⊆ intermediate ⊆
   advanced) still holds for both upload states; `comingSoon` preview nodes are unchanged;
   `storage`/`ingestion` remain **real** (not `comingSoon`) — they are merely conditionally
   rendered.
8. **AC8 — No protocol / text change; types clean.** No `Stage`/`events.ts` change;
   `STAGE_TO_STATION`/`STAGE_TO_PHASE` stay total; `tsc --noEmit` and `vite build` pass; no
   new user-facing strings.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `events.ts`: **n/a**.
- Station mapping: unchanged — `storage`/`ingestion` keep their stages; this only changes
  **whether they are rendered**, via a new `showUpload` dimension on the `visible*`
  helpers + `computeLayout`, derived from the event log by `hasUploadActivity`.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Reveal trigger?** → **Pure projection**: visible iff the current trace contains a
  `storage.upload` / `rag.ingest.*` event. (Rejected: session-document stickiness; manual
  toggle.)
- [x] **Which scenarios?** → All (wherever the two nodes already live).
- [x] **Cursor-scoped or whole-trace?** → Whole `events` list (not sliced to the cursor) so
  replay/step never reflows the layout mid-playback.

## Out of scope / deferred

- A session-scoped "keep visible while this conversation has documents" mode (rejected
  option B) — revisit only if whole-trace projection feels too transient.
- Any animation/transition polish on reveal/hide (they simply appear/disappear with the
  trace).
