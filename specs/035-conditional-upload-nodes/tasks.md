# Tasks: Reveal Storage + Ingestion only during an upload

> Ordered TDD checklist (red → green → refactor). All Vitest — no `[openai]`.

## Projection helper + gating

- [x] **T1 — test (red)**: `upload-visibility.test.ts` — `hasUploadActivity` truth table
  (storage.upload / rag.ingest.* ⇒ true; plain chat & `[]` ⇒ false) (AC4); `visibleStationIdsFor("simple")`
  excludes storage/ingestion and `(…, true)` includes them (AC1/AC2); `visibleHopsFor`
  gates the 3 upload hops on the flag (AC3).
- [x] **T2 — impl**: `derive.ts` add `hasUploadActivity`; `stations.ts` add
  `UPLOAD_ONLY_STATIONS` + `isUploadOnlyHop` and the `showUpload = false` param on
  `visibleStationsFor` / `visibleHopsFor` / `visibleStationIdsFor`. Green.

## Layout reflow

- [x] **T3 — test (red)**: `layout.test.ts` — default `computeLayout` omits storage +
  ingestion (data column shorter, no overlap); `computeLayout(_, _, true)` includes them
  stacked storage→ingestion→rag (AC5). Update the 034 placement test to pass `true`.
- [x] **T4 — impl**: `layout.ts` `computeLayout(expanded, scenario, showUpload = false)`
  forwards to `visibleStationIdsFor`. Green.

## Scenario model (three buckets)

- [x] **T5 — test (red)**: `scenario.test.ts` — `BASE_STATIONS` (7) is the default simple
  set; `+ UPLOAD_STATIONS` when the flag is set; comingSoon check excludes upload-only ids;
  cumulative ladder holds in both states (AC1/AC2/AC7).
- [x] **T6 — impl**: adjust `TODAY_STATIONS`→`BASE_STATIONS` + `UPLOAD_STATIONS`; update
  assertions to call the new signature. Green.

## Wire the canvas + inspector

- [x] **T7 — impl**: `FlowCanvas` reads store `events`, `const showUpload =
  useMemo(() => hasUploadActivity(events), [events])`, passes it to `visibleStationsFor` /
  `visibleHopsFor` / `computeLayout`. `InspectorPanel` Overview computes + passes the same
  flag. `TourCaption` keeps the default (no change). (AC6)

## Refactor + gates

- [x] **T8 — refactor + gates**: `tsc --noEmit` + `vite build` + full Vitest green;
  confirm no `Stage`/`events.ts`/i18n change; both exhaustive maps still total; move
  `spec.md` → `done`.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` (`tsc --noEmit` + build) green · full Vitest green
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched); `STAGE_TO_STATION` /
  `STAGE_TO_PHASE` still total; no new user-facing strings
- [x] `spec.md` status → `done`
