# Tasks: LLM rounds history (per-call drill-in)

> TDD checklist, ordered red → green → refactor. FE-only; no backend / pytest impact.

## Tasks

- [x] **T1 — test first (AC1/AC4)**: `frontend/src/lib/llmRounds.test.ts` — fixture with
      2 `agent.think` ENDs (+ paired `llm.prompt` ENDs) and 1 `llm.generate` END asserts
      `deriveLlmRounds` returns 3 ordered calls (2 reasoning + 1 generation); empty log →
      `[]`; partial log (cursor before generate) → 2 calls.
- [x] **T2 — implement**: `frontend/src/lib/llmRounds.ts` — `LlmCall` type +
      `deriveLlmRounds(events)`, seq-window pairing of `llm.prompt`↔`agent.think`. Make T1
      green.
- [x] **T3 — test first (AC2)**: round 1 and round 2 fixtures with *different* prompt
      `system`/`messages` text and *different* `latency_ms`/token metrics assert each
      entry exposes its own values (not the last round's).
- [x] **T4 — implement**: ensure the helper reads each round's own `llm.prompt` preview +
      `agent.think` metrics. Make T3 green.
- [x] **T5 — test first (AC3)**: generation fixture with `answer` + `latency_ms` +
      `ttft_ms` + `tokens_per_sec` asserts the generation entry surfaces them.
- [x] **T6 — implement**: generation-entry mapping. Make T5 green.
- [x] **T7 — UI: open/close (AC5)**: `StationNode.tsx` `HAS_DETAIL.llm = true`; `App.tsx`
      mount `<LLMDetail>` on `detail === "llm"`. Smoke/render test (or HAS_DETAIL +
      open-contract assertion) in `LLMDetail.test.tsx`.
- [x] **T8 — UI: overlay**: build `LLMDetail.tsx` (sibling of `AgentDetail`) rendering the
      call list, expandable rounds, prompt sections, generation row — reusing
      `formatLatency`/`formatTokens`/`formatUsd`.
- [x] **T9 — i18n (AC6 / §4)**: add the `llmDetail` block (en + pt) + its type to
      `strings.ts`; reuse existing prompt-section/ttft labels where possible.
- [x] **T10 — refactor**: clean up, keep all Vitest green; `tsc --noEmit` + build pass.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean (no backend change — trivially)
- [x] `pytest -q` green (unchanged — FE-only)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched); every `Stage` still mapped
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
