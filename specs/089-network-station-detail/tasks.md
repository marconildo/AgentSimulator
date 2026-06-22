# Tasks: Network-edge station full-view drill-ins

> TDD checklist. Each implement task is preceded by the failing test that drives
> it (red → green → refactor). Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC1/AC2/AC3)**: in `frontend/src/lib/stationDetail.test.ts`,
  write failing tests for `selectDns/selectCdn/selectWaf/selectLb/selectApiGw`:
  (a) a `seen:true` END event surfaces the typed fields; (b) `seen:false`/missing
  event → `{ seen: false }`.
- [x] **T2 — implement**: add the five selectors (+ typed return shapes, reusing
  the `*Data` interfaces from `events.ts`) to `lib/stationDetail.ts`. Make T1
  green.
- [x] **T3 — test first (AC5/AC8)**: in
  `frontend/src/components/NetworkApplianceDetail.test.tsx`, write failing tests:
  (a) LB overlay renders the reverse-proxy label; (b) with a `seen:true` event
  the In→Out fields render; (c) before the event's cursor (empty slice) the
  empty state shows.
- [x] **T4 — implement**: build `components/NetworkApplianceDetail.tsx` (shared,
  `kind`-parameterised) using `DetailShell` + `Section`/`KeyVal`/`Mono`/`Scroll`.
  Make T3 green.
- [x] **T5 — test first (AC4)**: in the StationNode/wiring test, assert the five
  network ids render an "Open full view" button and clicking calls
  `openDetail(id)` (toggle closes on second click).
- [x] **T6 — implement**: add `dns/cdn/waf/lb/apigw` to `HAS_DETAIL` in
  `StationNode.tsx`; wire `{detail === "<id>" && <NetworkApplianceDetail …/>}`
  for all five in `App.tsx`. Make T5 green.
- [x] **T7 — i18n (AC7, constitution §4)**: add the `networkDetail` bundle (type
  + en + pt) in `strings.ts`; confirm i18n parity test passes.
- [x] **T8 — refactor**: dedupe, confirm AC6 (Inspector network case untouched),
  keep all tests green.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` clean (n/a — no backend change, but run it)
- [ ] `pytest -q` green (no backend change; sanity run)
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npm test` (Vitest) green
- [ ] Protocol mirror unchanged (no Stage/events.ts change), every Stage still
      mapped to a station
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
- [ ] Ask the user whether the GitHub Pages demo (058) needs a re-capture
      (per the standing demo directive — FE-only display change, likely yes for
      the new overlays to show in the mocked build)
