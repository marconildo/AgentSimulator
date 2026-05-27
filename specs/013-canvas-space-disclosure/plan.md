# Plan: Reclaim canvas space + sharpen disclosure

## Approach

Collapse state is **layout state that the selection action must be able to
touch** (clicking a station re-opens the Inspector), so it lives in the existing
`useSimulator` store rather than local component state. Two booleans
(`chatCollapsed`, `inspectorCollapsed`) + two toggles; `select(id)` gains one
line that un-collapses the Inspector when `id` is non-null. This keeps the
auto-open behavior testable at the store level (pure, no DOM).

The layout is presentational: a small `SidePanel` wrapper in `App.tsx` renders
either the **expanded aside** (with an edge chevron to collapse) or a **~44px
rail** (icon + chevron to expand), per side. The chat/inspector components are
untouched — the wrapper composes around them, so no internal coupling.

For disclosure, the inline expansion already derives per-station rows in
`StationNode.innerRows`; `StationRuntime.latencyMs` is already computed in
`derive.ts`. We append a shared **latency row** in `ExpandedBody` so every
executing station gains a useful at-a-glance metric without duplicating the
Inspector's full drill-down.

## Affected files

**Backend**
- none

**Frontend**
- `frontend/src/store/useSimulator.ts` — add `chatCollapsed`/`inspectorCollapsed`
  + `toggleChat`/`toggleInspector`; `select` un-collapses the Inspector on a
  non-null id.
- `frontend/src/App.tsx` — `SidePanel` wrapper (rail vs expanded + edge handle)
  for both asides, driven by the store.
- `frontend/src/components/nodes/StationNode.tsx` — append a latency row in
  `ExpandedBody` when `rt.latencyMs` is defined.
- `frontend/src/i18n/strings.ts` — `node.latency` (en + pt).
- `frontend/src/store/useSimulator.panels.test.ts` — new store test (TDD).

## Protocol changes (constitution §1)

n/a — no Stage/Phase/TraceEvent change.

## Data model changes

n/a.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `node.latency` | `latency` | `latência` |

Panel toggle tooltips reuse existing `node.expand` / `node.collapse`.

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | defaults: both collapsed flags false | `useSimulator.panels.test.ts` |
| AC2 | toggleChat / toggleInspector flip independently | same |
| AC3 | select(non-null) un-collapses inspector + sets selected | same |
| AC4 | select(null) clears selection, leaves inspectorCollapsed | same |
| AC5 | visual (rail width / handle) — verified by screenshot, not unit-tested | manual |
| AC6 | inline expansion shows latency when latencyMs set | covered structurally; primarily visual |

## Risks / trade-offs

- The collapse preference is not persisted (deferred) — a reload re-opens both
  panels. Acceptable for now; matches today's behavior.
- The edge chevron overhangs the canvas border slightly; it sits above the React
  Flow surface (higher z-index) so it stays clickable.
- Auto-opening the Inspector on every `select` also fires during the guided tour
  (tour selects stations) — intended: the tour should show the Inspector.
