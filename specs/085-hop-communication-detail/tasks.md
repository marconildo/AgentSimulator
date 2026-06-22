# Tasks: Hop communication detail (click an edge → Inspector)

> Ordered TDD checklist (FE-only, no protocol change). red → green → refactor.

## Tasks

### Pure selector
- [x] **T1 — test first (AC2)**: `frontend/src/lib/hopDetail.test.ts` — `deriveHopData` returns the
      right discriminated kind + real fields per hop (request/edge/sql/rag/mcp/llm) and `none` for an
      empty/unknown hop; is pure + deterministic. (red)
- [x] **T2 — implement**: `frontend/src/lib/hopDetail.ts` — `HopRunData` union, `deriveHopData`, and
      the edge-chain segment builder (TLS/LB real vs preview). (green)

### Store selection
- [x] **T3 — test first (AC1)**: store cases — `selectHop(id)` sets `selectedHop` + clears
      `selected`/`tracesOpen`; `select(station)` clears `selectedHop`. (red)
- [x] **T4 — implement**: add `selectedHop` + `selectHop` to `useSimulator.ts`; clear it in
      `select`/`openTraces`/`openDetail`/`reset`. (green)

### Canvas wiring
- [x] **T5 — implement**: `FlowCanvas` `onEdgeClick` → `selectHop`; pane/station click clears it;
      pass `data.selected` to the edge; `FlowEdge` highlights the selected edge.

### Inspector rendering
- [x] **T6 — test first (AC3/AC4)**: `InspectorPanel.hop.test.tsx` — with a `selectedHop`, the panel
      shows the hop header + theory + the `deriveHopData` block; the `frontend→edge` hop shows the
      chain pipeline (TLS/LB real, others preview); an empty hop shows the no-data note. (red)
- [x] **T7 — implement**: hop-detail branch in `InspectorPanel` (+ `EdgeChain` helper); render theory
      from `hopsFor` meta + the "On this run" block from `deriveHopData`. (green)
- [x] **T8 — implement (AC4)**: simplify `StationNode.innerRows` case `"edge"` (drop the 5-row chain).

### Wrap-up
- [x] **T9 — i18n (AC6)**: add the inspector strings (en + pt) per the plan table.
- [x] **T10 — refactor**: keep the full suite green; `tsc --noEmit` + `npm run build` clean.
- [ ] **T11 — demo note**: re-flag the 058 fixture re-capture (edge hop empty until recaptured).

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` (`tsc --noEmit` + build) clean · `npm test` green
- [x] No backend diff; schema-mirror + phases parity untouched (AC5)
- [x] All new user-facing text in en **and** pt
- [x] `spec.md` status → done
