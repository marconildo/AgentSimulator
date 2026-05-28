# Plan: Reveal Storage + Ingestion only during an upload

> Pure projection (resolved): a `showUpload` boolean — derived from the event log by a new
> `hasUploadActivity(events)` — gates the two write-path nodes + their hops in the
> `visible*` helpers and `computeLayout`. No new state, no protocol change.

## Approach

Introduce one concept: **upload-only** visual elements. The `storage` and `ingestion`
stations and the three hops touching them (`backend→storage`, `backend→ingestion`,
`ingestion→rag`) are tagged upload-only and filtered out of the visible set unless a
`showUpload` flag is true. The flag is a **pure projection** of the trace —
`hasUploadActivity(events)` is true iff the log carries a `storage.upload` or any
`rag.ingest.*` event — computed in `FlowCanvas` and the inspector Overview from the store's
`events` (whole list, not cursor-sliced, so replay never reflows mid-playback).

`deriveView` and `STAGE_TO_STATION`/`STAGE_TO_PHASE` are untouched (still total over
`StationId`/`Stage`); "hidden" means "not rendered," not "not modelled." Because the two
nodes are only ever lit by upload events — and those same events flip `showUpload` true —
a hidden node can never be asked to animate.

Alternative considered: a `scenarios`-style membership or a store toggle. Rejected — the
event log already knows when an upload is in play; projecting from it keeps the canvas a
pure function of the trace (the project's core idea) and needs zero new state.

## Affected files

**Frontend**
- `frontend/src/lib/stations.ts` —
  - add `UPLOAD_ONLY_STATIONS: ReadonlySet<StationId> = new Set(["storage","ingestion"])`
    and `isUploadOnlyHop(h)` (`source` or `target` in the set);
  - give `visibleStationsFor`, `visibleHopsFor`, `visibleStationIdsFor` an extra
    `showUpload = false` param that drops the upload-only elements when false.
- `frontend/src/lib/derive.ts` — add `hasUploadActivity(events): boolean` (pure;
  `stage === "storage.upload" || stage.startsWith("rag.ingest.")`).
- `frontend/src/lib/layout.ts` — `computeLayout(expanded, scenario, showUpload = false)`
  forwards the flag to `visibleStationIdsFor`; the data column reflows from the visible set.
- `frontend/src/components/FlowCanvas.tsx` — read `events` from the store, compute
  `const showUpload = useMemo(() => hasUploadActivity(events), [events])`, and pass it to
  `visibleStationsFor` / `visibleHopsFor` / `computeLayout` (tiers unchanged — the services
  tier always has query-path members).
- `frontend/src/components/InspectorPanel.tsx` — compute the same flag from the store and
  pass it to `visibleStationsFor` for the Overview catalog (canvas/inspector parity).
- `frontend/src/components/TourCaption.tsx` — `computeLayout(expandedSet, scenario)` keeps
  the default (`false`); the tour uses a chat trace with no upload, so no change needed.

**Tests**
- `frontend/src/lib/scenario.test.ts` — split the station catalog into three buckets:
  `BASE_STATIONS` (always visible: the 7), `UPLOAD_STATIONS` (`storage`,`ingestion` — real
  but conditional), and the `comingSoon` previews. `visibleStationIdsFor("simple")` = base;
  `…("simple", true)` = base + upload. The comingSoon check excludes upload-only ids.
- `frontend/src/lib/layout.test.ts` — default layout omits storage/ingestion; with
  `true` they are present and stacked (AC5).
- `frontend/src/lib/upload-visibility.test.ts` (new) — `hasUploadActivity` truth table
  (AC4) + the `visible*` gating (AC1–AC3).

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent` change; `events.ts` untouched; both exhaustive maps
  stay total.

## Data model changes

- None (frontend render gating only).

## i18n strings (constitution §4)

- None — no new user-facing text (the nodes already ship their bilingual strings).

## Cloud map (constitution §5)

- n/a (no new tier/station).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `visibleStationIdsFor("simple")` excludes storage/ingestion | `scenario.test.ts` |
| AC2 | `visibleStationIdsFor("simple", true)` includes them | `scenario.test.ts` |
| AC3 | `visibleHopsFor` gates the 3 upload hops on the flag | `upload-visibility.test.ts` |
| AC4 | `hasUploadActivity` truth table | `upload-visibility.test.ts` |
| AC5 | `computeLayout` omits/includes storage+ingestion by flag, no overlap | `layout.test.ts` |
| AC6 | FlowCanvas/Inspector compute the flag from events (structural via AC1–AC4 + tsc) | build |
| AC7 | ladder cumulative both states; previews unchanged; nodes not comingSoon | `scenario.test.ts` |
| AC8 | no protocol/text change; `tsc`/build green | `npm run build` |

## Risks / trade-offs

- **Default-param ripple:** adding `showUpload = false` changes call sites — keep the
  default `false` so any un-updated caller (e.g. TourCaption) hides them, which is correct.
- **Replay stability:** project from the whole `events` array, not the cursor slice, or the
  nodes would pop in/out as you scrub past the `storage.upload` event. (Decided in clarify.)
- **scenario.test.ts churn:** the 008 model assumed two buckets (today vs comingSoon);
  this adds a third (real-but-conditional). The test is restructured intentionally; keep the
  cumulative-ladder and comingSoon invariants green.
- **Inspector/canvas parity:** if only the canvas gated visibility, the Overview could list
  an off-canvas node — so the inspector reads the same flag.
