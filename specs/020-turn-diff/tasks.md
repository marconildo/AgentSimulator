# Tasks: Diff the context window between turns

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Depends on 022** (prior-turn trace). **Clarify resolved** — stored trace via 022 ·
> reuse the estimated per-section split · adjacent (n vs n-1) (`spec.md`, 2026-05-27).

## Phase 1 — Shared section tally + diff (AC1, AC2)

- [x] **T1 — test first**: `frontend/src/lib/turnDiff.test.ts` — `contextSections(events)`
  returns per-section token estimates matching the existing bar (parity); `diffTurns`
  returns a signed delta per section + total delta (AC1).
- [x] **T2 — test first**: identical sections → delta 0; a section present in only one
  turn → a full add/remove (AC2).
- [x] **T3 — implement**: `frontend/src/lib/turnDiff.ts` (`Section`, `contextSections`,
  `diffTurns`); refactor `AgentDetail`'s context-window bar to consume `contextSections`
  (behavior-preserving, parity test green).

## Phase 2 — i18n (AC4, §4)

- [x] **T4 — test first**: parity — `diff.*` strings exist in en **and** pt.
- [x] **T5 — implement**: add the strings to `frontend/src/i18n/strings.ts` (en + pt).

## Phase 3 — Compare UI (AC3)

- [x] **T6 — implement**: in `AgentDetail.tsx`, add the "compare with previous turn" view
  (load the prior message's trace via 022, diff, annotate grew/shrank/same + total);
  when no prior turn (or evicted), show the unavailable + explained state. Tokens only.

## Phase 4 — Verify & refactor

- [x] **T7 — gates**: `npm test` (Vitest) · `npm run build` — green. Functions pure;
  protocol untouched.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC4)
- [x] `contextSections` is the single source (existing bar + diff); parity test green
- [x] No-prior-turn state is unavailable + explained (no faked deltas)
- [x] No protocol change; prior trace loaded via existing `GET /api/trace/{id}` (022)
- [x] Compare strings exist in en **and** pt
- [x] `spec.md` status updated to `done` (after 022 lands)
