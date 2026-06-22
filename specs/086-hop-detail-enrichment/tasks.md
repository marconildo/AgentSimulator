# Tasks: Hop detail enrichment

> FE-only, no protocol change. red → green → refactor.

## Tasks

- [x] **T1 — test first (AC1/AC2)**: extend `stations.test.ts` — every hop has a non-empty `why` in
      en + pt; the `frontend→backend` `why` mentions a reverse proxy + TLS/LB + an "also" role. (red)
- [x] **T2 — implement**: add `why?` to `HopMeta`/`HopSrc` + `resolveHop`; author `why` for all hops
      in `HOPS_SRC` (incl. the nginx/edge role). (green)
- [x] **T3 — test first (AC1 render)**: `InspectorPanel.hop.test.tsx` — the hop detail shows the
      "Why this hop" text for a selected hop. (red)
- [x] **T4 — implement**: `HopDetail` renders `hop.why` under the theory. (green)
- [x] **T5 — implement (AC3)**: ⊕ expand button on `FlowEdge`'s label → `selectHop(props.id)`,
      `pointerEvents:"all"`, emphasised on hover/selected.
- [x] **T6 — i18n (AC5)**: `inspector.hopWhy` + `inspector.hopExpandHint` (en + pt).
- [x] **T7 — refactor / gates**: `tsc` + `npm run build` + `npm test` green; update spec status.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (AC3 via tsc + store test + manual)
- [x] `npm run build` clean · `npm test` green
- [x] No backend diff; protocol parity untouched (AC4)
- [x] All new text en **and** pt
- [x] `spec.md` status → done
