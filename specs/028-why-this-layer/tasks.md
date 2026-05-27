# Tasks: Why this layer / What breaks without it

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor).

## Tasks

- [x] **T1 — test first (AC1)**: in `stations.test.ts`, assert every executing station
  (those with non-empty `stages`) resolves a non-empty `why` and `whatBreaks` for `en`
  and `pt`. (Red: fields don't exist yet.)
- [x] **T2 — implement**: add `why: Tr` + `whatBreaks: Tr` to `StationSrc`/`StationMeta`,
  resolve in `resolveStation`, author all 7 executing stations bilingually. (Green T1.)
- [x] **T3 — test first (AC4)**: assert the honest-caveat keywords are present —
  auth-stub on frontend/backend, HTTP/SSE on mcp, pool/single-instance on database — per
  language.
- [x] **T4 — implement**: bake those keywords into the authored content. (Green T3.)
- [x] **T5 — i18n (AC2/AC3)**: add `inspector.whyTitle` / `whyLabel` / `whatBreaksLabel`
  to `strings.ts` (en + pt); keep `strings.test.ts` parity green.
- [x] **T6 — implement render (AC2/AC3)**: render the "Why this layer / What breaks"
  section in `InspectorPanel` for the selected station, reading the resolved fields.
- [x] **T7 — parity (AC5)**: confirm `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity tests
  and `tsc --noEmit` stay green (no protocol/visual-model drift).
- [x] **T8 — refactor**: tighten wording, ensure `blurb` vs `why` don't overlap.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean (n/a — no backend change)
- [ ] `pytest -q` green
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` green
- [ ] Protocol mirror unchanged (`schemas.py` ↔ `events.ts`); every Stage still mapped
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
