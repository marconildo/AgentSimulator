# Spec: Execution Traces (hierarchical span tree)

| | |
|---|---|
| **ID** | 038-execution-traces |
| **Status** | done — all ACs met & verified: 11/11 `executionTree` unit tests, **337/337** Vitest, `tsc --noEmit` clean, `npm run build` green (the 036 migration that had held the build red has since landed). |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Supersedes **015-latency-waterfall**: the flat per-phase timing breakdown is
> replaced by a 2-level hierarchical span tree in the same Inspector slot.

## Problem / motivation

People who operate LLM agents in production read runs as a **LangSmith-style
execution trace**: a hierarchical waterfall where each graph node (`route`,
`think`, `tools`, `generate`, `respond`) is a span with its own duration and
token cost, and the model call / tool execution nests *inside* the node that
made it. Our current Inspector has two flat views — a per-phase timing breakdown
(015) and a flat event log (030) — but **nothing that shows the parent/child
structure of the run**: that the `ChatOpenAI` call lives inside `think`, that the
`calculator` execution lives inside `tools`, that `think` ran twice (the ReAct
loop). That nesting *is* the mental model of an agent, and we already emit every
number it needs (START/END timing per stage, plus tokens + cost on the LLM
stages). This makes the structure visible as a pure projection of the event log.

## Goals

- Show the run as a **2-level hierarchical span tree** in the Inspector Overview,
  replacing the flat timing breakdown (015) in that slot.
- Each **parent span = one pipeline node occurrence** in execution order; repeated
  nodes (ReAct rounds) appear as separate spans, in order.
- LLM nodes (`think`, `generate`) expose their **`ChatOpenAI` model call** as a
  child; the `tools` node exposes **one child per tool call** (named by the tool);
  `retrieve` exposes its RAG sub-steps. Other nodes are leaves.
- Every row shows **duration + a proportional waterfall bar**; LLM/tool-bearing
  rows also show **tokens**; the **root** shows total duration + total tokens +
  total cost — the LangSmith header line.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent`; no backend change; nothing re-measured.
  This is a pure projection of the existing event log (constitution §7).
- Not a flame graph, not a distributed trace across services, not deeper than
  2 levels (no `_should_continue` routing-edge rows — see Clarified).
- Not a cross-turn comparison (that overlaps 020-turn-diff).

## User-facing behavior

- The Inspector Overview lists an **Execution traces** entry alongside the
  stations (Frontend, Backend, …). Clicking it opens the tree **inside the
  Inspector body** — exactly like a station detail — with a `← Overview` back
  button at the top. Clicking another station from the canvas swaps the body
  back to that station's detail.
- The detail header carries the run totals as chips: **wall-clock duration**,
  **total tokens**, **total cost**.
- Under it, one row per pipeline node in execution order, each with its duration
  and a proportional bar. LLM and tool nodes are **expandable** to reveal their
  child call(s): `think → ChatOpenAI`, `tools → calculator`, `generate →
  ChatOpenAI`, `retrieve → embed / search / select`. A node that ran twice (ReAct)
  appears twice.
- Sub-millisecond durations read `<1 ms` (reuse `formatLatency`), never `0 ms`.
- Before any run, an empty-state line invites the user to run a turn.
- All labels/headers/chrome are bilingual (en + pt). The `ChatOpenAI` label and
  concrete tool names (e.g. `calculator`) are proper nouns and stay verbatim.

## Acceptance criteria

1. **AC1** — A pure function maps an event log to an **ordered list of parent
   spans**, one per pipeline-node occurrence in run order, excluding the
   `frontend`/`backend` request envelope. Each span carries `{ node, offsetMs,
   durationMs, children }`.
2. **AC2** — A node that occurs N times (ReAct rounds) yields **N separate parent
   spans**, order preserved (`think` and `tools` each appear twice for a
   two-round loop).
3. **AC3** — `think` and `generate` spans expose exactly one child labeled
   `ChatOpenAI` (carrying the model name when the events provide it); a `tools`
   span exposes **one child per tool call**, labeled by the tool name from the
   `mcp.call` event; `retrieve` exposes its `rag.*` sub-steps; `route`, `respond`,
   `memory`, and `persist` spans are **leaves** (no children).
4. **AC4** — Each span's `durationMs` is its wall-clock footprint (last − first
   event ts within the occurrence) and `offsetMs` is its start relative to the run
   start; a span carries `tokens`/`costUsd` when its underlying END events do
   (`agent.think`, `llm.generate`). The **root** reports total duration (run
   wall-clock span), total tokens, and total cost as the sums over the spans.
5. **AC5** — The Inspector Overview lists an **Execution traces** entry
   (replacing the former flat 015 timing breakdown) that opens the tree **inside
   the Inspector body** with a `← Overview` back button. The header carries the
   run totals (duration + tokens + cost) as chips; each row shows its duration
   and a **proportional bar** (width = `durationMs / totalMs`), and LLM/tool
   rows additionally show tokens. An empty-state line shows before the first
   run.
6. **AC6** — Every new label, node name, root/empty/chrome string exists in **both
   en and pt**; `ChatOpenAI` and concrete tool names are not translated.

## Protocol / stage impact

- New/changed `Stage`(s): **none** (pure projection — constitution §7).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (groups by node, derived from
  `STAGE_TO_PHASE`).

## Clarified (2026-05-27)

- [x] **Placement** → **replace** the flat timing breakdown (015) in the Inspector
  Overview slot; the two would otherwise be redundant timing views.
- [x] **Fidelity** → **2 levels** (node → its direct child model-call / tool-call);
  **no** routing-edge (`_should_continue`) rows — those add depth without teaching
  anything our event log can back honestly.
- [x] **Per-row presentation** → **duration + tokens + a proportional waterfall
  bar** per row; the root carries the LangSmith-style total + tokens + cost line.
- [x] **Placement, revised (2026-05-27)** → two-step iteration after review.
  First the inline panel at the top of the Overview was made a **list entry**
  alongside the stations (it was too cramped at the top). Then the click target
  was changed: rather than open a full-width overlay over `<main>`, the entry
  opens the tree **inside the Inspector body**, exactly like a station detail
  (with a `← Overview` back button) — the user clarified that the trace belongs
  in the Inspector, not over the canvas. Drives a `tracesOpen` boolean in the
  store (kept off `StationId` so the exhaustive switches stay total);
  `select(station)` clears it, so only one body view shows at a time.

## Out of scope / deferred

- Routing-edge (`_should_continue`) spans and a 3rd level (would need new events).
- A dedicated full-screen trace overlay (kept in the Overview for now).
- Cross-turn trace comparison (overlaps 020-turn-diff).
- Live mid-stream animation of the tree; it renders on the settled trace (the
  store's events + cursor already make replay free, but the design target is the
  finished run).
