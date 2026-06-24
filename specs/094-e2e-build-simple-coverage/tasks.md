# Tasks: E2E coverage for the Build Simple journey (drill-ins + memory) with richer step logs

> Ordered TDD checklist. These tests **are** the deliverable; "red" means the
> helper/reporter they need does not exist yet (or the spec file is absent). Run
> against the live stack (`docker compose up` + `npm run test:e2e`).

## Tasks

- [ ] **T1 — helpers + step logging (AC1)**: create `e2e/helpers.ts` lifting
  `ask`/`composer`/`lastAnswer` out of `chat.spec.ts`, wrapping `compose → send →
  settle` in named `test.step(...)`. Refactor `chat.spec.ts` onto it (assertions
  unchanged) and confirm the `list` reporter prints indented steps.
- [ ] **T2 — summary reporter (AC2)**: write `e2e/summary-reporter.ts` (Playwright
  `Reporter`, prints `— E2E summary —` with passed/failed/skipped + duration on
  `onEnd`); register it in `playwright.config.ts` beside `list` + `html`.
- [ ] **T3 — memory test (AC3)**: `e2e/memory.spec.ts` — send a fact-setting turn,
  then a dependent follow-up; assert the follow-up answer bubble is non-empty. Red
  until helpers exist, green against the live agent.
- [ ] **T4 — drill-in helpers**: add `openStationFullView(page, id)` +
  `expectDrillInHasData(page)` (DetailShell visible + empty placeholder absent) to
  `helpers.ts`.
- [ ] **T5 — drill-ins test (AC4)**: `e2e/drilldowns.spec.ts` — `describe.serial`,
  seed one RAG+tool turn, then for each of `agent, llm, mcp, database, backend,
  frontend, rag` open the full view and assert it has real data, then close.
- [ ] **T6 — hop + traces helpers**: add `clickHop(page, src, dst)` and
  `openExecutionTraces(page)` to `helpers.ts`.
- [ ] **T7 — inspection test (AC5 + AC6)**: `e2e/inspection.spec.ts` —
  `describe.serial`, seed one turn; click the `frontend→backend` arrow → assert the
  hop detail shows real per-run data (AC5); open Execution Traces → assert ≥1 span
  row (AC6).
- [ ] **T8 — protocol mirror**: n/a (no `Stage`/protocol change).
- [ ] **T9 — i18n**: n/a (no product prose; test-harness log text only).
- [ ] **T10 — cloud map**: n/a (no new tier/station).
- [ ] **T11 — refactor + green**: tidy helpers, ensure all spec files share one
  helper surface, run the full suite against the stack until green; flip
  `spec.md` status `planned → in-progress → done`.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing E2E test
- [ ] `ruff check .` clean (no backend change — sanity only)
- [ ] `pytest -q` green (no backend change — sanity only)
- [ ] `npm run build` passes (`tsc --noEmit` + build) — `src/` untouched
- [ ] `npm test` (Vitest) green — `src/` untouched
- [ ] `npm run test:e2e` green against `docker compose up` (the 3 original + 4 new
  scenarios), with step logs + the summary block visible
- [ ] Protocol mirror in sync (no change), no new Stage to map
- [ ] No new product user-facing text (so §4 n/a) — confirmed
- [ ] `spec.md` status updated to `done`
