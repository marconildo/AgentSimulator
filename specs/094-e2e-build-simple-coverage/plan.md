# Plan: E2E coverage for the Build Simple journey (drill-ins + memory) with richer step logs

> The HOW. Written after `spec.md` is `clarified`. Decisions here respect every
> principle in `.specify/constitution.md`. This spec is **test-harness only** — no
> backend, no protocol, no product runtime code, so several constitution sections
> are n/a and are marked as such.

## Approach

Stay inside the existing live-stack Playwright suite (`frontend/e2e/`, run by the
manual `integration.yml` against `docker compose up`). All new tests select the
**already-built** UI exactly as the current `chat.spec.ts` does — pinned to
`lang=en`, onboarding suppressed, structural assertions only. **No `frontend/src/**`
runtime file is modified** (no new product `data-testid`s); the tests locate stations
by their React-Flow `data-id` (which already equals the `StationId`) and assert on
existing visible text/labels.

Three moving parts:

1. **A shared helpers module** (`e2e/helpers.ts`) — lift `ask()`, `composer()`,
   `lastAnswer()` out of `chat.spec.ts` and wrap the phases in named `test.step(...)`
   so every test that sends a turn prints `compose → send → settle` substeps (AC1).
   Add small helpers: `openStationFullView(page, stationId)` (click the node's
   full-view button via its `.react-flow__node[data-id=…]`), `expectDrillInHasData`
   (DetailShell visible + its empty placeholder absent), `clickHop(page, "frontend",
   "backend")`, `openExecutionTraces(page)`.

2. **A custom summary reporter** (`e2e/summary-reporter.ts`) — a tiny Playwright
   `Reporter` implementation printing one `— E2E summary —` block on `onEnd`
   (passed / failed / skipped counts + total duration), registered alongside the
   existing `list` + `html` reporters in `playwright.config.ts` (AC2). Mirrors the
   "Resumo E2E" block the user showed from the other project.

3. **The new test files** — split by concern, each reusing the helpers:
   - `chat.spec.ts` (existing) — refactored onto the helpers so its phases also show
     as steps (AC1). Assertions unchanged.
   - `memory.spec.ts` — multi-turn long-term memory (AC3).
   - `drilldowns.spec.ts` — open full view for the 7 real Build-Simple stations (AC4).
   - `inspection.spec.ts` — hop detail (AC5) + Execution Traces tree (AC6).

To keep wall-clock sane (every turn is a real OpenAI call, suite runs `workers:1`),
the drill-in / hop / traces tests **share a single seeded turn** per file via a
`test.describe.serial` + a `beforeAll`-style first test that sends one RAG+tool
message, then the inspection assertions run against that same completed turn without
re-sending. (Playwright keeps one page per worker; a `describe.serial` with an
ordered "seed the turn" step is the simplest deterministic shape.)

### Selectors (all already in the DOM, no src changes)
- Station node: `page.locator('.react-flow__node[data-id="agent"]')` etc. The 7 real
  Build-Simple ids: `agent, llm, mcp, database, backend, frontend, rag`.
- Full-view button text: `Open full view` for six; `Open RAG pipeline` for `rag`
  (`t.node.openFull` / `openPipeline` in `i18n/strings.ts`).
- Drill-in opened + has data: `DetailShell` renders a header title + back button
  `← …`; the no-data branch renders `emptyText` instead of the body. Assert the
  overlay is visible **and** the empty placeholder text is **not** present.
- Hop: React-Flow edge `data-id="frontend-backend"` (id = `"source-target"`); click
  its hit-path; assert the Inspector hop detail shows real per-run evidence.
- Execution Traces: the Overview list "Execution traces" row → opens the span tree
  inside the Inspector (`ExecutionTraces`); assert ≥1 span row.

## Affected files

**Backend** — none.

**Frontend (test harness only — nothing under `frontend/src/`)**
- `frontend/e2e/helpers.ts` — **new**: shared `ask`/locator helpers wrapped in
  `test.step`, plus `openStationFullView` / `expectDrillInHasData` / `clickHop` /
  `openExecutionTraces`.
- `frontend/e2e/summary-reporter.ts` — **new**: custom Playwright reporter (summary).
- `frontend/e2e/chat.spec.ts` — refactor onto helpers (assertions unchanged).
- `frontend/e2e/memory.spec.ts` — **new** (AC3).
- `frontend/e2e/drilldowns.spec.ts` — **new** (AC4).
- `frontend/e2e/inspection.spec.ts` — **new** (AC5, AC6).
- `frontend/playwright.config.ts` — register the summary reporter.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed; `schemas.py` ↔ `events.ts`
untouched; no new `readoutFor`/`renderDetail`/`STAGE_TO_PHASE` cases.

## Data model changes

None (vector store and SQLite untouched). The tests run against whatever the live
stack produces; they create conversation rows only as a side effect of sending real
messages, exactly like a user.

## i18n strings (constitution §4)

n/a — no **product** user-facing prose is added. The only new strings are
developer-facing test-harness log output (step names, summary header), which §4 does
not govern. The tests themselves read existing UI via the English locale the suite
already pins.

| key / location | en | pt |
|---|---|---|
| (none — test log text only) | | |

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

These **are** the tests — TDD's "write the failing test first" is the deliverable.
Each is red until the corresponding helper/reporter exists, then green against the
live stack. They cannot run in the offline `pytest` lane (they need the Docker stack
+ a real key), so they live in the manual `integration.yml`, like the current suite.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 step logs | each spec uses `test.step`; visible as indented steps | all `e2e/*.spec.ts` via `helpers.ts` |
| AC2 summary | reporter prints `— E2E summary —` with counts | `e2e/summary-reporter.ts` (+ config) |
| AC3 memory | two-turn: follow-up answer non-empty | `e2e/memory.spec.ts` |
| AC4 drill-ins | 7 stations: full view opens + has data | `e2e/drilldowns.spec.ts` |
| AC5 hop | click `frontend→backend` → hop detail w/ real data | `e2e/inspection.spec.ts` |
| AC6 traces | open Execution Traces → ≥1 span | `e2e/inspection.spec.ts` |

The offline gates (`ruff`, `pytest`, `npm run build`, `npm test`/Vitest) stay green
because nothing they cover changes. The new code is `.ts` under `e2e/` (excluded from
the Vitest glob `*.test.ts(x)` under `src/`) and from `tsc --noEmit`'s app build, but
is type-checked by `playwright test` (and we run `tsc` over the e2e dir locally).

## Risks / trade-offs

- **Wall-clock** — six real OpenAI turns would be slow; mitigated by sharing one
  seeded turn per inspection file (`describe.serial`) so the drill-in/hop/traces
  assertions reuse a single agent run.
- **Selector drift** — relying on React-Flow `data-id` + visible labels rather than
  product testids keeps `src/` untouched but is slightly more brittle; acceptable
  because the labels are stable English UI strings and the suite is manual-trigger
  (not a blocking PR gate). If a selector proves fragile we revisit adding a minimal
  test id in a follow-up.
- **Single-instance assumption** (constitution §7) preserved — `workers:1`,
  `fullyParallel:false` unchanged; one shared backend, one trace store.
- **No determinism risk added** — assertions remain structural (overlay opened, data
  present, span count ≥ 1), never on model wording.
