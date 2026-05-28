# Tasks: Memory growth — the honest occupation of the context window across turns

> Ordered TDD checklist. Each implementation task is preceded by a failing test
> (red → green → refactor). Reference: `spec.md` (AC1–AC9) + `plan.md`.

## Tasks

### Backend — per-pair tokenization (AC1, AC2)

- [x] **T1 — test first**: in `backend/tests/test_context_budget.py`, add
  `test_history_pair_tokens_per_pair_and_empty` covering: `[]` → `[]`; N pairs
  → N positive counts; an empty `{"message":"", "answer":""}` pair returns the
  framing-only count (not 0).
- [x] **T2 — implement T1**: add `history_pair_tokens(history) -> list[int]` in
  `backend/app/llm/context.py`, reusing `_encoder()` + `_render_history()` on a
  single-pair list per call.
- [x] **T3 — test first**: add `test_history_pair_tokens_reconciles_with_memory_budget`
  asserting `|sum(history_pair_tokens(p)) − context_budget(history=p,…).memory| <= 2`.
- [x] **T4 — refactor**: if T3 reveals a >2 drift, adjust the helper to render
  each pair with the same join semantics as `_render_history` (no extra `\n`).

### Backend — emit on `db.read` (AC3)

- [x] **T5 — test first**: in `backend/tests/test_main.py` (a keyless test),
  drive a single turn and assert the `db.read` END event has
  `recent_tokens: list[int]` of `len(recent)` non-negative ints in the same
  order as `recent`.
- [x] **T6 — implement T5**: in `backend/app/main.py`'s `Stage.DB_READ` span,
  after `read_history(...)`, set
  `db_rec.data = {**history, "recent_tokens": history_pair_tokens(history["recent"])}`.
- [x] **T7 — schemas doc**: in `backend/app/schemas.py`'s `TraceEvent` comment
  block, list `recent_tokens` next to the existing `recent`/`limit` notes.

### Frontend — `deriveMemoryGrowth` projection (AC4, AC5, AC6, AC7)

- [x] **T8 — test first**: create `frontend/src/lib/memoryGrowth.test.ts`
  covering:
  - empty events / cursor < 0 → `{ rows: [], totalTokens: 0, nextToFallOut:
    null, limit: 0, available: false }`
  - a `db.read` END with `recent_tokens` populates `rows[]` oldest→newest, with
    `totalTokens` = Σ
  - `recent.length === limit` → `nextToFallOut = 1` (the oldest row's turn);
    `< limit` → `null`
  - missing `recent_tokens` (older trace) → `available: false`
  - `rows[i].tokens` proportional to a normalized `barWidth` that maxes at 1 on
    the largest row
- [x] **T9 — implement T8**: write `frontend/src/lib/memoryGrowth.ts` (pure;
  reads only the latest `db.read` END ≤ cursor; types per `plan.md`).

### Frontend — render in Long-term-Memory panel (AC4 visual)

- [x] **T10 — implement**: in `AgentDetail.tsx`, inside the existing Long-term-
  Memory `Panel`, render the new growth section when `growth.available &&
  growth.rows.length > 0`. Use the `barWidth` to size each row's bar. Add the
  placeholder "this turn — not yet stored" row visually (no test — pure copy).
- [x] **T11 — manual check**: `npm run build` green; visually verify with a
  two-turn conversation that bar widths reconcile with `Memory (long-term)`
  in the budget panel (Σrows ≈ category value, ±2).

### i18n (AC8)

- [x] **T12 — test first**: in `frontend/src/i18n/strings.test.ts`, extend the
  036 parity block (or add a new `describe`) asserting non-empty en + pt for
  the 6 new keys: `memoryGrowth`, `memoryGrowthHint`, `currentlyInWindow`,
  `nextToFallOut`, `thisTurnNotStored`, `memoryLesson`.
- [x] **T13 — implement T12**: add the keys to `frontend/src/i18n/strings.ts`
  with the en/pt copy from `plan.md` (interface + en object + pt object).

### Gates (AC9)

- [x] **T14 — backend gates**: `ruff check .` clean; `pytest -q` green
  (includes new T1/T3/T5 keyless tests; existing `[openai]` tests skipped
  without a key).
- [x] **T15 — frontend gates**: `npm run build` green (`tsc --noEmit` + Vite
  build); `npx vitest run` all-pass (includes new `memoryGrowth.test.ts` +
  extended `strings.test.ts`).
- [x] **T16 — spec status**: flip `spec.md` Status from `clarified` to `done`;
  update `MEMORY.md` entry for [[spec-039-memory-growth-visualization]].

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
  (T1→AC1, T3→AC2, T5→AC3, T8→AC4/AC5/AC6/AC7, T12→AC8, T15→AC9).
- [ ] `ruff check .` clean
- [ ] `pytest -q` green
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npx vitest run` all-pass
- [ ] Protocol mirror confirmed: `schemas.py` comment lists `recent_tokens`;
  FE reads it via an optional cast (no required type change)
- [ ] Every Stage still mapped to a station (no `Stage` added — sanity
  re-confirm via the existing exhaustiveness test)
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
