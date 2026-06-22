---
description: Read-only review of frontend (React + Vite + TS + xyflow) changes against project conventions.
---

Review the current `frontend/` change in **AgentSimulator** against its architecture. **Read-only — report, don't edit.** Ground every point in `git diff` and `AGENTS.md`.

## Enforce

1. **Pure projection.** `lib/derive.ts` `deriveView(events, cursor)` turns the event log into everything the canvas draws. **Live streaming and step/replay are the same code path** — replay is just a smaller cursor. Flag rendering logic that reads live state outside this projection, or that would make replay diverge from live.
2. **Geometry vs content separation.** `lib/layout.ts` `computeLayout(...)` owns ALL canvas geometry; `lib/stations.ts` owns identity/content only; `FlowCanvas` reads positions from layout. Flag geometry leaking into `stations.ts` or hardcoded coordinates in components.
3. **`stations.ts` single source of truth** for the visual model (tiers, stations, hops, boundary), derives `STAGE_TO_STATION`. Flag duplicated station identity elsewhere.
4. **Exhaustive maps/switches.** A new `Stage` → in exactly one station's `stages` + in `STAGE_TO_PHASE` (phases.ts). A new `StationId` → a `case` in `readoutFor` (FlowCanvas) and `renderDetail` (InspectorPanel). (Defer the full protocol audit to `/review-protocol`; flag obvious gaps.)
5. **Cloud overlay (§5).** A new tier/station fills `clouds: { azure, aws, gcp }`; labels resolve via `cloudValue(meta, cloud)`. `generic` role is translatable; cloud service names are proper nouns (not translated). Flag a missing cloud or a service name wrapped in `{ en, pt }`.
6. **i18n (§4).** Every new user-facing string is `{ en, pt }` (or `strings.ts`). Defer the thorough sweep to `/review-i18n`; flag obvious English-only additions.
7. **Clean types.** `npm run build` runs `tsc --noEmit` as a gate. Flag `any`/`as` escape hatches and anything that wouldn't type-check. Run `npm run build` and `npm test` from `frontend/` and report.
8. **Store discipline.** Canvas state (event list + cursor, `expanded`, `detail`, selection) lives in the Zustand stores (`store/useSimulator.ts`, `lib/selection.ts`). Flag component-local state that belongs in the store, or direct DOM/`EventSource` use (SSE goes through `lib/sse.ts`).

**Output:** per-area ✅/❌ with `file:line` and the concrete fix. Separate **must-fix** from **nits**. State whether `tsc`/Vitest would pass. End with a verdict. Do not modify files.
