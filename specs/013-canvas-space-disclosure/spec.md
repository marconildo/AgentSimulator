# Spec: Reclaim canvas space + sharpen disclosure

| | |
|---|---|
| **ID** | 013-canvas-space-disclosure |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

## Problem / motivation

The canvas — the star of the visualizer — is squeezed between a 340px chat
sidebar and a 372px inspector sidebar that are *always* on screen. On a laptop
that leaves the topology cramped. The two side panels can't be put away, and the
Inspector doesn't reliably surface itself when the learner clicks a station, so
the payoff of clicking ("see the real data") isn't guaranteed to be visible.
Separately, a station's **inline ⊕ expansion** shows only a row or two — the
learner has to open the full Inspector to get even a latency reading, so the
inline affordance under-delivers.

## Goals

- Let the user **collapse either side panel to a thin rail** to give the canvas
  room, and re-open it from a clearly visible handle.
- **Guarantee the Inspector is visible when any station is clicked** — if it was
  collapsed, the click re-opens it.
- Make the **inline ⊕ expansion genuinely useful at a glance** (e.g. latency on
  every executing station) while the *full* detail stays in the Inspector.

## Non-goals

- No new pipeline `Stage`/`Phase`/`TraceEvent`; this is pure projection + layout.
- Not redesigning the Inspector's content model or the chat thread.
- No persistence of the collapsed/expanded preference across reloads (deferred).

## User-facing behavior

- Each side panel (Chat on the left, Inspector on the right) has a **chevron
  handle** on its inner edge that collapses it to a **~44px rail**. The rail shows
  the panel's icon + a chevron pointing inward; clicking either re-expands it.
- Clicking a station on the canvas **selects it and ensures the Inspector is
  open** (un-collapsing the right rail if needed).
- A station's inline ⊕ panel shows its existing summary rows **plus a latency
  reading** when the stage has reported one; the Inspector remains the place for
  the full protocol/data drill-down.
- All new affordances are bilingual (en + pt).

## Acceptance criteria

1. **AC1** — Given the simulator store at defaults, `chatCollapsed` and
   `inspectorCollapsed` are both `false` (panels open).
2. **AC2** — `toggleChat()` flips `chatCollapsed`; `toggleInspector()` flips
   `inspectorCollapsed`; neither affects the other panel or the event log/cursor.
3. **AC3** — Given `inspectorCollapsed === true`, when `select(id)` is called with
   a non-null station id, then `inspectorCollapsed` becomes `false` and `selected`
   is that id.
4. **AC4** — `select(null)` clears the selection and does **not** change
   `inspectorCollapsed` (deselecting never forces the panel open).
5. **AC5** — When a panel is collapsed, the canvas region is wider by that panel's
   width minus the rail (rail ≈ 44px); a visible handle re-opens it.
6. **AC6** — A station's inline ⊕ expansion renders a latency row whenever
   `StationRuntime.latencyMs` is defined for that station.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a**

## Open questions (clarify before planning)

- [x] Collapse style → **thin rail (~44px) with an icon + chevron handle**
  (chosen by the user over fully-hidden + floating tab).

## Out of scope / deferred

- Persisting collapse state to localStorage.
- Per-node bespoke expansion content beyond the shared latency row (can be a
  follow-up that enriches `innerRows` station-by-station).
