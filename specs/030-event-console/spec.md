# Spec: Structured event console (expandable trace log)

| | |
|---|---|
| **ID** | 030-event-console |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The footer status line ("`agent.route · Agent received the query 5/158`",
"`mcp.discover · Discovering available tools 8/25`") is the most "real production" touch
in the app — it reads like a live log. But it only ever shows **one line**: the event at
the current cursor. A learner can't scroll the history, can't see relative timing, can't
inspect a single event's payload. Real observability tools (Datadog, Langfuse, an OTel
trace view) let you scroll the event stream and drill into any span — that's exactly the
mental model the simulator should teach.

Every `TraceEvent` already carries everything needed — `seq`, `ts`, `stage`, `phase`,
`label`, `data`, `metrics` — and the front end already holds the full ordered list with
a cursor. So a scrollable, expandable **event console** is a pure projection of data we
already have: no new requests, no protocol change. It also gives a natural home for the
"take this data out of the app" affordances the assessment asked for — **copy the
assembled prompt / the retrieved chunks / the raw event JSON**, and **copy the request
(trace) id**.

## Goals

- An **expandable console** (collapsed by default) that lists the run's events in order,
  scrollable, with each row showing **relative timestamp**, `stage`, `phase` and label.
- The console tracks the **cursor** — the current event is highlighted, and stepping /
  scrubbing moves the highlight (consistent with the canvas; same pure-projection path).
- **Per-event drill-down** ("explain this event"): from→to (which station, and the hop
  direction for cross-station events), **payload size** (bytes of the event `data`),
  **latency** (for END events), and the raw `data`/`metrics`.
- **Copy / export** affordances: copy a single event's raw JSON, copy the whole trace
  JSON, and copy the **request (trace) id** — so a learner can take the assembled prompt
  or the retrieved-chunk array out of the app.
- All new chrome ships in **English and Portuguese** (constitution §4).
- Pure projection (constitution §7): the console derives entirely from the existing event
  list + cursor; live streaming and replay are the same code path.

## Non-goals

- **No new `Stage`/`Phase`/`TraceEvent`, no backend change.** This is a front-end view
  over data already streamed/stored.
- Not a replacement for the footer status line (that stays as the one-line "now"
  indicator); the console is the expandable full view.
- Not a remote observability backend / OTel exporter (that's the Advanced-rung
  `observability` preview node — its own future spec).
- Not editable; not a filter/query language (a simple stage filter is allowed but a full
  search DSL is out of scope).
- Not changing how the cursor/stepping works — the console *reads* the cursor, it does
  not introduce a new playback model.

## User-facing behavior

A control near the footer status line (e.g. a "▸ log" / "console" toggle) expands a
**scrollable panel** listing every event up to the current cursor (or the whole run when
replay is at the end). Each row, terminal-styled:

```
+0.000s  backend        start   API received the request
+0.158s  agent.route    end     Agent received the query        ·  3 KB · 12 ms
+0.412s  rag.embed      end     Embedding the query             ·  1 KB · 412 ms
```

- **Relative timestamp** = `ts − firstEventTs`.
- The **current cursor** row is highlighted; clicking a row can move the cursor / select
  the owning station (consistent with the timeline phase chips, 004/022).
- Clicking a row's **"explain"** affordance opens a popover/expansion with: the owning
  **station**, **from → to** + direction for hops, **payload size** (bytes), **latency**
  (END events), and the pretty-printed `data` / `metrics`.
- **Copy buttons**: per-event "copy JSON", a panel-level "copy full trace", and "copy
  request id" (the `trace_id`).

All labels/headings/tooltips ship in **en + pt**. Event `stage`/`phase` strings, the
trace id, and copied JSON are verbatim data, not translated.

## Acceptance criteria

> Front-end assertions; pure projection over a fixture event list (e.g. the bundled tour
> trace) — no model needed.

1. **AC1 — Lists all events in order with relative time.** Given an event list, the
   console projection yields one row per event in `seq` order, each with a relative
   timestamp = `ts − events[0].ts` (first row `+0.000s`), the `stage`, `phase` and label.
2. **AC2 — Tracks the cursor.** The row whose index equals the store cursor is marked
   "current"; advancing/retreating the cursor moves the "current" mark, and no event
   beyond the cursor is shown as current.
3. **AC3 — Drill-down fields are correct.** For a given event the drill-down exposes:
   the owning station (via `STAGE_TO_STATION`), payload size = byte length of the
   serialized `data`, and (for an END event) a latency derived from `metrics.latency_ms`
   (or the START→END delta). A cross-station event exposes a from→to pair.
4. **AC4 — Copy/export produce valid payloads.** "Copy event" yields the event's exact
   JSON; "copy full trace" yields the JSON array of all events; "copy request id" yields
   the run's `trace_id`. (Asserted on the value handed to the clipboard helper.)
5. **AC5 — Collapsed by default; toggle works.** The console starts collapsed (the
   footer one-line status is unchanged) and expands/collapses via its control.
6. **AC6 — Bilingual chrome (§4).** Console heading, "explain", copy buttons and column
   labels have identical leaf keys in `en` and `pt`, each non-empty.
7. **AC7 — No protocol/projection drift.** No backend or protocol change; the console is
   derived purely from the event list + cursor; existing `deriveView` behavior and the
   parity tests are untouched; `tsc` build green.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none** — the console is a global view; it *uses*
  `STAGE_TO_STATION` (and hop direction) to label rows but adds nothing to the model.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Where does the console live?** → Anchored to the **footer status area** as an
  expandable panel (the one-line status stays as the collapsed "now"); not a separate
  route. Keeps it next to the playback controls the learner already uses.
- [x] **Does clicking a row move the cursor?** → **Yes** — clicking a row seeks the cursor
  to that event (and may select the owning station), reusing the 004/022 affordance, so
  the console and canvas stay in lock-step. (A read-only mode is acceptable if seeking
  proves fiddly, but seeking is the goal.)
- [x] **Show events past the cursor?** → During a live run / step, show up to the cursor;
  in full replay (cursor at end) show all. The "current" mark never points past the
  cursor (AC2).
- [x] **Payload size definition?** → Byte length of the serialized event `data` (a proxy
  for "how much moved"), shown in KB; not the whole event envelope.

## Out of scope / deferred

- A real OTel/Langfuse exporter and remote trace viewer (Advanced `observability` node).
- A query/filter DSL or full-text search across events (a single stage/phase filter is
  the most that might sneak in).
- "Compare two traces side-by-side" (related but distinct; see 020-turn-diff and a
  possible future compare-traces spec).
- Downloading the trace as a file (copy-to-clipboard is the chosen export for now).
