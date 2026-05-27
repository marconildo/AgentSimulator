# Spec: Scripted, anchored guided tour

| | |
|---|---|
| **ID** | 014-tour-scripted |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

The guided tour (005) works — its reducers are tested and it's wired — but it is a
**quiet phase-walk**: a low-salience caption pinned to the bottom of the canvas that
advances every 3.5s. In the v2 assessment a reviewer clicked ▶ Tour and reported
"nothing happens" (they clicked it in the empty state, where it is correctly disabled,
and then missed the faint bottom caption). The tour also doesn't **anchor** its
narration to the node it's describing, so the eye isn't led from word to component —
the single thing that would make it teach. The tour is the app's biggest "promise":
making it land is the highest-ROI onboarding investment.

## Goals

- Make each tour stop **visibly emphasize the station it narrates** and anchor the
  narration near that node, so attention follows the explanation across the topology.
- Raise the **discoverability/salience** of the tour control and the active narration.
- Give a first-time visitor a way to **understand the journey before sending a
  message** (today the control is dead until a run exists).

## Non-goals

- No backend call, no new `Stage`/`Phase`/`TraceEvent` — the tour stays a pure
  projection of an existing event log (constitution §3/§7).
- Not removing the phase rail or the replay controls; the tour drives them.
- Not auto-starting the tour on first load.

## User-facing behavior

- Starting the tour walks the run phase by phase. For each stop, the **narrated
  station is highlighted** on the canvas and a narration bubble is shown anchored to
  (or clearly pointing at) that station.
- The narration is scripted, friendly prose — one line per phase — in **en + pt**.
- Pause/resume/stop behave as in 005 and hand control back cleanly.
- From an **empty state**, the tour offers an onboarding path (see Open questions).

## Acceptance criteria

1. **AC1** — For a given event log, `tourSteps` yields one ordered stop per occurring
   phase, each stop exposing its `cursor` index **and** the `station` that owns the
   phase's first event (extends 005's tested reducer).
2. **AC2** — While a stop is active, the derived view marks **exactly one** station as
   the tour's narrated/emphasized station, equal to that stop's `station`; when the
   tour is idle/done, no station is force-emphasized.
3. **AC3** — Advancing past the last stop ends the tour (`status: "done"`) and releases
   the emphasis and any forced selection (preserves 005 AC4).
4. **AC4** — Every timeline phase has non-empty scripted narration in **both en and
   pt** (parity test).
5. **AC5** — Pausing makes ticks inert and resuming continues from the same stop
   (preserves 005 AC3).
6. **AC6** — From an **empty state** (no run yet), ▶ Tour loads a **bundled canned
   trace** (a captured real run, no OpenAI call) into the simulator and the tour walks
   it; the control is **no longer disabled** in the empty state (supersedes 005 AC5's
   empty-state gating). The canned trace's every event maps to a station via
   `STAGE_TO_STATION` and reaches a finished state (guard test).

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a** (reuses `STAGE_TO_STATION`)

## Clarified (2026-05-27)

- [x] **Empty state** → **bundled canned trace.** ▶ Tour from empty state loads a
  captured real run (shipped static, no OpenAI call) so a first-time visitor previews
  the journey before sending anything. (Goal #3; highest-ROI onboarding.)
- [x] **Anchor style** → **narration balloon anchored next to the active node** (points
  at it), leading the eye from word to component. (Goal #1.)
- [x] **Copy** → **new, longer scripted narration** (one friendly line per phase, the
  "👉 …" style), replacing the terse 005 captions. en + pt.

## Out of scope / deferred

- A timeline of multiple canned scenarios.
- Branching/interactive tours (the user choosing a path).
