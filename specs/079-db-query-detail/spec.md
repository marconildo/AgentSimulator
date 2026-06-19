# Spec: App Database query detail

| | |
|---|---|
| **ID** | 079-db-query-detail |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

## Problem / motivation

The "App Database — operations this turn" full view (076/077) currently shows only
a *summary* of the relational write-path for the turn: a `SELECT` label with
`session` + `rows stored` for the read, and an `INSERT` label with `Row id` +
`rows stored` for the write. It never shows **which SQL statements actually ran**.

But a single turn runs several real statements per operation — the history read
fires a `SELECT COUNT(*)` and a `SELECT message, answer … ORDER BY created_at DESC
LIMIT ?`; the persist fires `INSERT INTO messages …`, an `UPDATE sessions …`, a
`SELECT COUNT(*)`, plus (when the turn has attachments) `SELECT 1 FROM documents …`
and `INSERT INTO message_documents …`. All of that is invisible today.

The visualizer's whole promise is "everything is real, and you can inspect the real
data at each station." For the App Database station that promise is half-kept: the
user sees *that* a SELECT and an INSERT happened, but not *which* SELECT or *which*
INSERT. This closes that gap so the relational store is as honest and inspectable
as the RAG, MCP and LLM stations already are.

## Goals

- Show, in the App Database full view, **every real SQL statement** that executed
  during the turn, grouped by the operation it belongs to (READ / WRITE).
- For each statement, show the **actual command with its real values** (parameters
  substituted in), plus how many rows it affected/returned.
- Keep it scoped to the current turn only (one trace = one turn) — no whole-history
  dump. The existing READ/WRITE sections are the per-operation blocks.

## Non-goals

- No new pipeline `Stage`, station, hop or tier. This is additive `data` on the
  existing `db.read` / `db.write` spans (precedent: 051-failure-treatments).
- No change to *which* SQL the store runs — we only **observe and report** the
  statements that already execute.
- No SQL editing/replay/console. Read-only projection.
- The Inspector panel keeps the theory copy; the detail (full view) gets the queries.

## User-facing behavior

In the App Database "open full view" overlay:

- The **RECENT HISTORY (READ)** block lists each statement the read ran, in order,
  each rendered as the real SQL with values inlined and a `→ N rows` readout.
- The **CONVERSATION PERSISTED (WRITE)** block does the same for the persist path
  (INSERT messages, UPDATE sessions, the COUNT, and attachment statements when the
  turn carried attachments).
- Long parameter values (message/answer text, JSON `chunks`/`skills`) are truncated
  for display with an ellipsis so the statement stays readable.
- The existing summary rows (operation, session, row id, rows stored) remain.
- All new labels ship in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1** — Given a turn with no prior history, when it completes, then the
   `db.read` END `data` carries a `queries` list whose entries each have
   `operation`, `sql` (with values inlined), and `rows` — and it includes both the
   `SELECT COUNT(*)` and the `SELECT message, answer … LIMIT ?` statements.
2. **AC2** — Given any turn, when it completes, then the `db.write` END `data`
   carries a `queries` list including the `INSERT INTO messages …`, the
   `UPDATE sessions …`, and the `SELECT COUNT(*)` statements, in execution order,
   each with `operation`/`sql`/`rows`.
3. **AC3** — Given a turn that pins an attachment document, when it completes, then
   the `db.write` `queries` additionally include the `SELECT 1 FROM documents …`
   and the `INSERT INTO message_documents …` statements; a turn with no attachment
   includes neither.
4. **AC4** — The reported `sql` for a parametrized statement shows the **real
   parameter values** substituted (not `?` placeholders), with over-long values
   truncated; the `rows` reflects the actual rows affected/returned.
5. **AC5** — `selectDatabase` exposes the per-operation `queries` for the visible
   cursor slice; `DatabaseDetail` renders one row per statement under the matching
   READ/WRITE block, showing the SQL and `→ N rows`. Omitting `queries` (older
   traces) degrades gracefully to today's summary-only view.
6. **AC6** — Every new user-facing string exists in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Additive `data.queries` on the existing
  `db.read` and `db.write` END events (documented in the `TraceEvent` docstring).
- Mirror in `frontend/src/types/events.ts`: **required** — add the `queries` shape
  to the `db.read`/`db.write` data typing (or a shared `DbQuery` interface).
- Station it maps to in `stations.ts`: **none new** — App Database (`database`),
  already mapped.

## Open questions (clarify before planning)

- [x] Inline real values vs. parametrized + params list → **inline real values**
      (user choice, 2026-06-19).
- [x] Which statements to surface → **all real statements** that run in the turn
      (user choice, 2026-06-19).

## Out of scope / deferred

- Surfacing read/write queries from *other* stations (none run app-DB SQL today).
- Per-statement latency (the spans already carry operation-level latency; statement
  timing would need finer instrumentation — parked).
