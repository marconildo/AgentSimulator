# Tasks: <feature name>

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Tasks

- [ ] **T1 — <test first>**: write failing test for AC1 in `backend/tests/…`
- [ ] **T2 — <implement>**: make T1 pass
- [ ] **T3 — <test first>**: write failing test for AC2
- [ ] **T4 — <implement>**: make T3 pass
- [ ] **T5 — protocol mirror**: update `schemas.py` ↔ `events.ts` (if applicable)
- [ ] **T6 — i18n**: add en + pt strings (constitution §4)
- [ ] **T7 — cloud map**: fill azure/aws/gcp for any new tier/station (constitution §5)
- [ ] **T8 — refactor**: clean up, keep tests green

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` clean
- [ ] `pytest -q` green (offline, `DEMO_MODE=true`)
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), every Stage mapped to a station
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
