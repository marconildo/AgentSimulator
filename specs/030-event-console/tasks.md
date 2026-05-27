# Tasks: Structured event console (expandable trace log)

> The work, ordered, as a TDD checklist (red → green → refactor).

## Tasks

- [x] **T1 — test first (AC1)**: `eventLog.test.ts` — events → rows in `seq` order with
  relative time (first row `+0.000s`), stage/phase/label present.
- [x] **T2 — implement**: `lib/eventLog.ts` projection. (Green T1.)
- [x] **T3 — test first (AC2)**: cursor maps to the "current" row; nothing past the
  cursor is current.
- [x] **T4 — implement**: thread cursor through the projection. (Green T3.)
- [x] **T5 — test first (AC3)**: drill-down exposes station (`STAGE_TO_STATION`), payload
  byte size, END latency, and from→to for cross-station events.
- [x] **T6 — implement**: drill-down derivation. (Green T5.)
- [x] **T7 — test first (AC4)**: copy event / full trace / request id hand the exact
  value to the `copyText` seam.
- [x] **T8 — implement**: `EventConsole` copy actions + `lib/clipboard.ts` seam. (Green.)
- [x] **T9 — implement render (AC5)**: collapsed-by-default expandable panel mounted by
  the footer status; row highlight + click-to-seek.
- [x] **T10 — i18n (AC6)**: add `console.*` strings (en + pt); `strings.test.ts` green.
- [x] **T11 — parity (AC7)**: `deriveView`/parity tests unchanged; `tsc --noEmit` green.
- [x] **T12 — refactor**: memoize projection; cap/virtualize long lists.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean (n/a — no backend change)
- [ ] `pytest -q` green
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` green
- [ ] No protocol change; `STAGE_TO_STATION`/`STAGE_TO_PHASE` parity intact
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
