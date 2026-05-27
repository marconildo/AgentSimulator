# Tasks: Cumulative conversation HUD + pre-send estimate

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Depends on 022** (re-derive source). **Clarify resolved** — re-derive from saved
> traces · each `mcp.call`/each chunk · `js-tiktoken` lazy (`spec.md`, 2026-05-27).

## Phase 1 — Pure usage tally + fold (AC1)

- [x] **T1 — test first**: `frontend/src/lib/usage.test.ts` — `cumulativeUsage` folds a
  list of `TurnUsage` into correct `turns`/token/cost/toolCalls/ragHits totals; and
  `tallyUsage(events)` equals `deriveView`'s usage (parity) and counts `mcp.call` ENDs +
  retrieved chunks.
- [x] **T2 — implement**: `frontend/src/lib/usage.ts` (`TurnUsage`, `tallyUsage`,
  `cumulativeUsage`); refactor `derive.ts` to reuse `tallyUsage` (no behavior change).

## Phase 2 — Eviction-tolerant aggregation (AC2)

- [x] **T3 — test first**: folding a record list with a missing (evicted) turn yields a
  `partial` result and never throws.
- [x] **T4 — implement**: per-conversation HUD state (`useHud` or a `useChat` slice) that
  loads each message's trace via 022, tallies, folds, sets `partial` on a 404; recompute
  on turn-complete and conversation switch (reflect only the active conversation).

## Phase 3 — Pre-send estimate (AC3)

- [x] **T5 — test first**: `frontend/src/lib/tokenize.test.ts` — `estimateTokens(text)`
  returns a plausible approximate count (lazy tokenizer resolves).
- [x] **T6 — implement**: `frontend/src/lib/tokenize.ts` — lazy `import()` of
  `js-tiktoken` (`o200k_base`) + `estimateTokens` + a cost estimate from the 011 rate.

## Phase 4 — i18n + UI (AC4, AC5)

- [x] **T7 — test first**: i18n parity — all `hud.*` strings exist in en **and** pt.
- [x] **T8 — implement**: add the strings; `ConversationHud.tsx` (totals via
  `formatTokens`/`formatUsd`, tokenizer label, `partial` note) near the header; the
  composer pre-send hint (≈ tokens · ≈ cost, marked estimate) in `ChatPanel.tsx`.

## Phase 5 — Verify & refactor

- [x] **T9 — gates**: `npm test` (Vitest) · `npm run build` — green. `js-tiktoken` stays
  out of the initial bundle (lazy). No protocol change.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC5)
- [x] HUD reflects only the active conversation; evicted traces → `partial`, no crash
- [x] Tokens/cost render via `formatTokens`/`formatUsd`; tokenizer label shown honestly
- [x] All HUD strings exist in en **and** pt
- [x] `spec.md` status updated to `done` (after 022 lands)
