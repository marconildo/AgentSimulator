# Spec: Timeline navigable by phase

| | |
|---|---|
| **ID** | 004-timeline-phases |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Turn the replay scrubber from a continuous, unlabeled ruler into a row of
> **named phase markers** — `request → route → retrieve → reason → tools →
> generate → respond → persist` — so a learner can read the pipeline as a
> sequence of meaningful steps and **jump straight to a phase**, the way the
> Transformer Explainer lets you click into a stage instead of dragging a raw
> slider.

## Problem / motivation

The timeline (`Timeline.tsx`) today is a `0..N` range input with small,
**unlabeled** tick marks at stage boundaries. To revisit "the moment the agent
decided to call a tool" the user has to drag and read the status chip until the
right stage scrolls by. There is no at-a-glance map of *what the steps are* or
*where I am*. For an educational visualizer this is the single biggest
navigation gap: the status bar already names the current stage (`llm.generate`,
`rag.embed`), but that meaning never reaches the slider itself.

## Goals

- A labeled **phase rail** under (or replacing) the raw ticks: each phase shown
  as a named marker positioned at the event where that phase begins.
- **Click a phase → jump** the replay cursor to that phase's first event.
- The phase that contains the current cursor is visually **highlighted** (the
  "you are here").
- Phases are a **stable, ordered grouping of the existing `Stage`s** — every
  `Stage` belongs to exactly one phase (exhaustive, like `STAGE_TO_STATION`).
- Phase names are **bilingual** (en + pt), like all user-facing prose (§4).
- Pure projection (§7): the rail is derived from the event log + cursor only —
  **no backend change, no new request, no protocol change**.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent` (this is a frontend grouping over existing
  stages; "timeline phase" is **not** the protocol `Phase` enum START/PROGRESS/END).
- No auto-play / captions — that is `005-guided-tour`, which builds on this.
- No change to how stations light up on the canvas (`deriveView` stays as-is).

## User-facing behavior

Below the scrubber track, instead of anonymous ticks, the user sees a compact
row of **named phase chips** in run order (e.g. *request · route · retrieve ·
reason · tools · generate · respond · persist*). Passed phases are lit, upcoming
ones dim, and the phase the cursor is currently inside is emphasized. Clicking a
chip moves the playhead to the start of that phase. The existing play/step
controls and the live `LIVE` indicator are unchanged. When a phase did not occur
in a given run (e.g. **tools** when the agent answered without calling a tool),
its chip is either omitted or shown disabled (see open question Q2).

*(All phase labels ship in English **and** Portuguese — §4.)*

## Acceptance criteria

> Numbered and testable. Each becomes a failing test first (TDD, §9). Logic lives
> in a pure module so it can be unit-tested with Vitest without rendering.

1. **AC1** — A `STAGE_TO_PHASE` map assigns **every** `Stage` (including the
   `rag.ingest.*` stages) to **exactly one** `TimelinePhase`; a test enumerates
   `Stage` and asserts full, non-overlapping coverage (mirrors the §6 guarantee
   for stations).
2. **AC2** — Given an event log, `phaseMarkers(events)` returns the phases that
   actually occurred, **in run order**, each as `{ phase, index, count }` where
   `index` is the **first event** belonging to that phase and `count` is the
   number of maximal contiguous segments of that phase (≥ 2 ⇒ the `×N` badge,
   Q3). Labels are lang-dependent and resolved separately via `phaseLabelsFor`,
   so the deriver itself stays pure and language-independent (mirrors how
   `STAGE_TO_STATION` is lang-independent while `stationsFor` carries prose).
3. **AC3** — Clicking a phase marker sets the simulator cursor to that phase's
   `index` (jump-to-phase), reusing `setCursor`.
4. **AC4** — `activePhase(events, cursor)` returns the phase that the event at
   `cursor` belongs to; the matching chip is rendered as active.
5. **AC5** — Every `TimelinePhase` has an en **and** a pt label; a test asserts
   no phase is missing a translation.
6. **AC6** — The rail is a pure function of `(events, cursor)`; deriving it
   triggers no fetch and no change to `deriveView`/`schemas.py`/`events.ts`.

## Protocol / stage impact

§1 & §6.

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station mapping in `stations.ts`: **unchanged** (`STAGE_TO_STATION` untouched;
  `STAGE_TO_PHASE` is a *new, parallel* grouping for the timeline only).

## Clarifications (resolved 2026-05-26)

- [x] **Q1 — Phase set & order.** **Keep the proposed 9 phases**, in run order:
  `request` (frontend, backend), `memory` (db.read), `route` (agent.route),
  `retrieve` (rag.embed, rag.search, rag.retrieve, + rag.ingest.* for uploads),
  `reason` (agent.think, llm.prompt), `tools` (mcp.discover, mcp.call),
  `generate` (llm.generate), `respond` (respond), `persist` (db.write). This
  covers all 17 `Stage`s exactly once.
- [x] **Q2 — Phases that don't occur.** **Show the full canonical rail**; phases
  that didn't fire this run are dimmed/disabled (not clickable) — the learner
  always sees the complete pipeline map. `phaseMarkers(events)` still returns
  only the phases that actually occurred (AC2); the component overlays the full
  `PHASE_ORDER`.
- [x] **Q3 — ReAct repeats.** **Show repetitions.** A phase that recurs across
  the ReAct loop (e.g. `reason`, `tools`) is annotated with a `×N` count badge,
  where `N` is the number of maximal contiguous segments mapping to that phase.
  The chip stays in its canonical slot (one chip per phase); clicking it jumps to
  the phase's **first** occurrence (AC3).
- [x] **Q4 — Visual form.** **Replace the unlabeled ticks** with the labeled
  phase rail (Transformer-Explainer style). The range slider still provides
  event-level scrubbing; the named chips become the markers.

## Out of scope / deferred

- Auto-play tour + captions (`005-guided-tour`).
- Per-phase latency badges on the rail (could fold into `007` transparency).
