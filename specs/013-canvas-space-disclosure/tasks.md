# Tasks: Reclaim canvas space + sharpen disclosure

> TDD checklist. Store behavior (AC1–AC4) is driven test-first; the layout/visual
> bits (AC5–AC6) are presentational and verified by build + screenshot.

## Tasks

- [x] **T1 — test first**: `useSimulator.panels.test.ts` — defaults false (AC1),
  toggles flip independently (AC2), `select(non-null)` un-collapses inspector
  (AC3), `select(null)` leaves it (AC4). Red.
- [x] **T2 — implement**: add `chatCollapsed`/`inspectorCollapsed` +
  `toggleChat`/`toggleInspector`; `select` un-collapses inspector on non-null id.
  Green.
- [x] **T3 — implement (AC5)**: `SidePanel` wrapper in `App.tsx` — expanded aside
  with edge collapse chevron vs ~44px rail with icon + expand chevron, both
  sides, driven by the store.
- [x] **T4 — implement (AC6)**: append latency row in `StationNode.ExpandedBody`
  when `rt.latencyMs` is defined.
- [x] **T5 — i18n**: add `node.latency` in en + pt.
- [x] **T6 — verify**: `tsc --noEmit` + `vitest` green; screenshot collapsed /
  expanded / station-click-opens-inspector.

## Definition of done

- [x] AC1–AC4 map to passing tests in `useSimulator.panels.test.ts`
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] No protocol change (n/a), no unmapped Stage
- [x] New text (`node.latency`) exists in en **and** pt
- [x] `spec.md` status updated to `done`
