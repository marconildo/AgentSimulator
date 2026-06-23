# Tasks: Visualize a WAF block

> Ordered TDD checklist (red → green → refactor). Mostly FE + one infra (CORS).

## Tasks

- [x] **T1/T2 — detection**: `WafBlockedError` on a 403 in `lib/sse.ts` (both
  stream + batch) + `lib/sse.test.ts` (3 tests).
- [x] **T3/T4 — projection + store**: `BlockedOutcome` + `"blocked"` station status
  in `derive.ts`; `deriveView(events, cursor, tour, blocked)` lights path-to-WAF;
  `useSimulator.blocked` + `blockRun` (cleared on beginRun/reset/load); threaded in
  `App.tsx`. `derive.test.ts` (+2).
- [x] **T5/T6 — render**: blocked node styling + 403 badge in `StationNode`; WAF
  blocked readout in `FlowCanvas`; WAF drill-in blocked branch in
  `NetworkApplianceDetail` (verdict/403/why/payload); bilingual blocked chat note in
  `ChatPanel`; en + pt strings. Component test (+1).
- [x] **T7/T8 — CORS**: Varnish adds `Access-Control-Allow-Origin` when absent (so
  the cross-origin 403 is readable) + config-audit test.
- [x] **T9 — AC6 regression**: `blocked == null` reproduces today's projection;
  706 vitest green; exhaustive switches compile.
- [x] **T10 — i18n**: every new string en + pt.
- [x] **T11 — verify gates**: tsc ✓ · 706 vitest ✓ · `npm run build` ✓ · ruff ✓ ·
  backend network tests ✓ (21). Manual `docker compose up` smoke still recommended
  (send `<script>alert(1)</script>` → see the WAF block live). `spec.md` → `done`.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `npm run build` + `npm test` green; `ruff`/`pytest` green (config-audit)
- [ ] No new `Stage`; no fabricated `TraceEvent`s for a block (AC5); no backend diff
- [ ] All new user-facing text exists in en **and** pt
- [ ] Live block verified via `docker compose up` (CI can't run Docker)
- [ ] `spec.md` status updated to `done`
