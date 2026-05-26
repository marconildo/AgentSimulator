# Spec: Guided tour (storytelling mode)

| | |
|---|---|
| **ID** | 005-guided-tour |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> A one-click **▶ Tour** that plays a finished run back phase by phase, and at
> each phase: moves the playhead, opens the matching station in the Inspector,
> and shows a one-line **caption** at the bottom of the canvas explaining what is
> happening ("Now the agent decides whether to call a tool…"). It is the
> equivalent of the Transformer Explainer's "Play" — turning a click-to-explore
> tool into a guided, readable narrative.

> **Depends on `004-timeline-phases`** — the tour walks the phase boundaries
> defined there (`phaseMarkers`, `STAGE_TO_PHASE`).

## Problem / motivation

Today the most valuable detail (retrieved chunks, the assembled prompt, the tool
call, token streaming) is hidden behind manual clicks on each station, and the
only way to "watch the story" is to drag the scrubber and guess which node to
inspect. A first-time visitor doesn't know the pipeline well enough to drive it.
A guided tour reads the lifecycle **for** them — left-to-right, narrated — so the
app teaches on its own before inviting exploration.

## Goals

- A **▶ Tour** control that, given a finished/replayable trace, auto-advances
  through the run **one phase at a time** (using `004`'s phases).
- At each phase the tour: (a) sets the cursor to the phase's first event,
  (b) **selects that phase's station** in the Inspector (via `STAGE_TO_STATION`),
  (c) shows a **bilingual caption** describing the phase.
- **Pause / resume / stop**, and a sensible default pace (configurable constant).
- When the tour ends, it returns control to the user (no station forced open).
- Captions are **bilingual** (en + pt) — §4.
- Pure projection (§7): the tour only drives existing UI state (cursor, selected
  station, a caption string) computed from the event log — **no backend, no new
  request, no protocol change.**

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent`.
- No new data shown that isn't already in the trace (transparency is `007`).
- No narrated audio/voiceover; captions are text only.
- Not a replacement for the existing replay controls (play/step still exist for
  raw, station-status playback); the tour is the *narrated* layer on top.

## User-facing behavior

After a run completes (or on any replayable trace), a **▶ Tour** button is
available near the timeline. Pressing it starts a guided playback: the canvas
phase rail advances chip by chip, the right-hand Inspector automatically opens
the station for the current phase, and a caption bar at the bottom of the canvas
shows a short explanation for that phase. The user can **pause** (freezing on the
current phase to read/inspect), **resume**, or **stop** (which hands full control
back). Captions, button labels and the phase narration all ship en + pt.

*(All tour prose ships in English **and** Portuguese — §4.)*

## Acceptance criteria

> Numbered and testable. The advancement logic is a **pure reducer** so it can be
> unit-tested with Vitest without timers or rendering.

1. **AC1** — Given a finished trace, a `tourStep(state)` reducer advances through
   `phaseMarkers(events)` **in order**, yielding for each phase
   `{ cursor, station, phase }` where `cursor` = the phase's first-event index
   and `station` = `STAGE_TO_STATION` of that phase's stages.
2. **AC2** — Each `TimelinePhase` has a **bilingual caption**; a test asserts no
   phase is missing an en or pt caption.
3. **AC3** — `pause` freezes the tour on the current phase (no advance on the next
   tick); `resume` continues from there; `stop` ends the tour and clears the
   forced selection/caption.
4. **AC4** — When the tour reaches the last phase it **stops automatically** and
   returns control (no infinite loop; matches the existing replay's end behavior).
5. **AC5** — Starting the tour is only possible when there is a replayable trace
   (events present); with no trace the control is disabled.
6. **AC6** — Tour state changes touch only `cursor`, `selected`, and a `caption`;
   no fetch is issued and `schemas.py`/`events.ts`/`deriveView` are unchanged.

## Protocol / stage impact

§1 & §6.

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station mapping: **unchanged** (the tour *reads* `STAGE_TO_STATION`).

## Clarifications (resolved 2026-05-26)

- [x] **Q1 — Pace.** **Fixed** dwell per phase, a single configurable constant
  `TOUR_PACE_MS ≈ 3500`. Predictable and simple; latency-proportional pacing was
  rejected as fiddly and sensitive to model variability.
- [x] **Q2 — Caption home.** In **`i18n/strings.ts`** under `tour.captions`
  (`Record<TimelinePhase, string>`) — the `Strings` interface enforces en+pt
  lockstep at compile time. **One line** per phase (no title+sentence; the phase
  name already shows on the rail).
- [x] **Q3 — Token streaming.** The tour **lands on phase boundaries** — the
  cursor is set to each phase's first event (AC1, pure per-phase reducer). No
  per-token sub-stepping. The full answer still becomes visible when the tour
  reaches `respond` (deriveView reassembles the tokens collected up to that
  cursor), so the narrative still ends on the written answer.
- [x] **Q4 — Where does the button live?** In the **`Timeline` controls** next to
  ▶/⏭ (a `TourControls` block). Reuses the timeline's existing
  disabled-when-no-events pattern (AC5) and sits beside the phase rail it walks.
- [x] **Q5 — Tour state owner.** **Extend `useSimulator`.** The replay timer
  (`playTimer`/`stopTimer`), `cursor` and `selected` already live there, so a
  tour timer can be made mutually exclusive with replay trivially (one shared
  stop path). A separate store would have to reach back into `useSimulator`.

## Out of scope / deferred

- Audio narration / captions localization beyond en + pt.
- Branching tours or per-station "learn more" deep links.
- Auto-starting the tour on first visit (could be a later onboarding spec).
