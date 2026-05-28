# Tasks: Context-window budget — the `/context`-style token grid

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives it
> (red → green → refactor). Backend token counting is keyless; only AC4's end-to-end emit is `[openai]`.

## Backend — the real budget

- [x] **T1 — test (AC1)**: `backend/tests/test_context_budget.py` — `context_window()` returns the
  real size for `gpt-4o-mini`/`gpt-4o`/`gpt-4.1*` and `DEFAULT_CONTEXT_WINDOW` (non-zero) for an
  unknown model. *(red)*
- [x] **T2 — impl (AC1)**: `backend/app/llm/context.py` — `MODEL_CONTEXT_WINDOW`, `DEFAULT_CONTEXT_WINDOW`,
  `context_window(model)`. Module docstring flags it a labelled teaching approximation. *(green)*
- [x] **T3 — test (AC2, AC3)**: in the same test file — `context_budget(...)` returns the six used
  categories via `tiktoken`; empty inputs → 0; **Tool definitions** > 0 with tools and == 0 with no
  tools; tool *results* land in Messages, not Tool definitions (distinctness). *(red)*
- [x] **T4 — impl (AC2, AC3)**: implement `context_budget(...)` in `context.py` (reuse the
  `rag/ingestion.py` encoder). *(green)*
- [x] **T5 — test (AC4)**: extend `backend/tests/test_agent.py` — a real run's last `llm.prompt` END
  `data` carries `context_window` (int) + `context_budget` (map). `[openai]`. Plus a **keyless**
  assertion that `STAGE_TO_STATION`/`STAGE_TO_PHASE` (mirror) are unchanged & total (no new `Stage`). *(red)*
- [x] **T6 — impl (AC4)**: in `backend/app/agent/graph.py` `think_node`, attach `context_window`
  + `context_budget` to `prompt_rec.data` next to `prompt_preview`/`context`. *(green)*

## Protocol mirror

- [x] **T7 — protocol mirror (AC4)**: `frontend/src/types/events.ts` — add `ContextBudget` type +
  optional `context_window?`/`context_budget?` on `PromptPreview`; note in `schemas.py` `TraceEvent`
  comment. (No new `Stage`.)

## Frontend — projection + render

- [x] **T8 — test (AC5, AC6, AC9)**: `frontend/src/lib/contextBudget.test.ts` — `deriveBudget`:
  used == real `prompt_tokens`, free == window−used, pct; latest `llm.prompt` ≤ cursor (cursor before
  any prompt ⇒ 0 used / all free); fallback to `chars/4` + DEFAULT window when fields absent, with
  `estimated` flag. *(red)*
- [x] **T9 — impl (AC5, AC6, AC9)**: `frontend/src/lib/contextBudget.ts` — `deriveBudget(events, cursor)`. *(green)*
- [x] **T10 — test (AC7)**: in `contextBudget.test.ts` — `gridCells(...)` allocates colored cells in
  category order with the remainder as Free space; sums to `cellCount`; legend includes only non-zero
  categories + Free space. *(red)*
- [x] **T11 — impl (AC7)**: `gridCells(...)` in `contextBudget.ts`; render the grid + "used / max (pct)"
  headline (model name) + legend in `AgentDetail.tsx`, replacing the composition bar. *(green)*
- [x] **T12 — test (AC8)**: update `frontend/src/lib/turnDiff.test.ts` — `contextSections` prefers the
  emitted `context_budget`, falls back to `chars/4`; new `Section` key set; diff parity holds. *(red)*
- [x] **T13 — impl (AC8)**: update `turnDiff.ts` (`Section` keys + `contextSections` source); rewire
  `TurnCompare` labels in `AgentDetail.tsx`. *(green)*

## i18n + polish

- [x] **T14 — i18n (AC10)**: add the new `agentDetail.*` strings (plan table) in **en + pt**; confirm
  the parity test passes.
- [x] **T15 — refactor**: dedupe `lastEnd`/section mapping shared by `turnDiff` and `contextBudget`;
  keep all tests green; remove the now-dead composition-bar code paths.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format .`
- [x] `pytest -q` green (with `OPENAI_API_KEY`; keyless budget tests pass without one)
- [x] `npm run build` passes (`tsc --noEmit` + build) · `npm test` (Vitest) green
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); no new `Stage`; `STAGE_TO_STATION`
      & `STAGE_TO_PHASE` still total
- [x] All new user-facing text exists in en **and** pt (§4); cloud map n/a (§5)
- [x] `spec.md` status updated to `in-progress` → `done`
