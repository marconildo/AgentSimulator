# Tasks: Network appliance drill-in — real IN

> Ordered TDD checklist (red → green → refactor). FE-only.

## Tasks

- [x] **T1/T2 — selector**: `selectInboundRequest` in `stationDetail.ts` + unit test
  (`stationDetail.test.ts`, 2 tests).
- [x] **T3/T4 — view + i18n**: reworked the IN section of `NetworkApplianceDetail.tsx`
  (DNS → host headline; HTTP appliances → `POST /api/chat` + the real message;
  honest empty otherwise); added `requestLine`/`message`/`noRequest` en + pt.
- [x] **T5 — AC5 regression**: 091 OUT / reconstructed-log / verbatim assertions
  still green.
- [x] **T6 — i18n**: new labels in en + pt.
- [x] **T7 — verify gates**: tsc ✓ · 700 vitest ✓ · `npm run build` ✓. No backend
  diff. `spec.md` → `done`.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `npm run build` (`tsc --noEmit` + build) + `npm test` (Vitest) green
- [ ] No `Stage`/protocol change; no backend diff
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
