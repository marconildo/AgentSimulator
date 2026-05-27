# Tasks: Public-internet boundary & flow direction polish

> Ordered TDD checklist (red → green → refactor). The three sub-features ship
> independently; **public frontier is primary**. Sub-features 2 & 3 are partly present —
> strengthen, don't rebuild.

## Sub-feature 1 — Public frontier (primary)

- [x] **T1 — test first (AC1)**: `layout.test.ts` — `computeLayout` exposes a public
  frontier positioned between the client tier's right edge and the private boundary's left
  edge, spanning the boundary height, no overlap; present in every scenario. (Red.)
- [x] **T2 — implement (model + layout)**: add `PUBLIC_BOUNDARY_SRC` (generic, bilingual,
  no `clouds`) + `publicBoundaryFor`; compute its geometry in `layout.ts`. (Green T1.)
- [x] **T3 — test first (AC2/AC5)**: `stations.test.ts`/`strings.test.ts` — the frontier
  label resolves identically across generic/azure/aws/gcp and has en/pt parity.
- [x] **T4 — implement (render + i18n)**: render the dashed line + label in `FlowCanvas`
  (BoundaryNode variant / `PublicFrontierNode`); add the label string (en + pt). (Green.)

## Sub-feature 2 — Return-leg distinctness

- [x] **T5 — test first (AC3)**: a `returnStyleFor(active, reverse, stream)` helper returns
  a distinct return style for active reverse/stream vs plain outbound; assert `deriveView`
  marks the `respond`/SSE return legs `reverse`.
- [x] **T6 — implement**: extract the helper from `FlowEdge` and apply the return style on
  active reverse legs (keep the existing `stream` look). (Green T5.)

## Sub-feature 3 — Persistence dwell

- [x] **T7 — test first (AC4)**: a run ending in `db.write` → `database` is the emphasized
  `activeStation` at the final cursor; `pacing` gives `db.write` a non-zero dwell.
- [x] **T8 — implement**: pin/raise the end-of-run emphasis; add the `db.write` dwell in
  `pacing.ts` (keep `deriveView` time-independent). (Green T7.)

## Wrap-up

- [x] **T9 — parity (AC6)**: `STAGE_TO_STATION`/`STAGE_TO_PHASE` parity + `deriveView`
  tests unchanged; `tsc --noEmit` green; `visibleStationIdsFor("simple")` unchanged.
- [x] **T10 — refactor**: keep the frontier subtle; ensure no double-styling of the SSE leg.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean (n/a — no backend change)
- [ ] `pytest -q` green
- [ ] `npm run build` (`tsc --noEmit` + build) and `npm test` green
- [ ] No protocol change; the frontier is a boundary (no station/guard change)
- [ ] All new user-facing text in en **and** pt
- [ ] `spec.md` status updated to `done`
