# Spec: E2E coverage for the Build Simple journey (drill-ins + memory) with richer step logs

| | |
|---|---|
| **ID** | 094-e2e-build-simple-coverage |
| **Status** | planned |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-23 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The live-stack Playwright suite (`frontend/e2e/`, run by the manual
`integration.yml`) proves the **pipeline** of the default **Build Simple**
architecture — a chat answers, a knowledge-base question surfaces sources, a math
question surfaces a tool call. That is the backend story.

But the whole reason this app exists is the **interactive visualization**: after a
turn, the user opens each station's "Open full view", clicks an arrow to read a
hop, and opens the Execution Traces tree to inspect the real run. None of that is
covered end-to-end today — it is only unit-tested as a pure projection (Vitest),
never against a *live* trace produced by the real agent. So a regression that makes
a drill-in render empty (or a placeholder) against real data would ship green.

Two gaps, then:
- **Coverage** — the drill-ins and the long-term-memory path (multi-turn) are
  untested end-to-end for Build Simple.
- **Observability of the suite itself** — each test is a single opaque block in the
  CI log (`✓ 1 … basic chat …`), so when something is slow or flaky you cannot see
  *which phase* (compose / send / settle / assert) was responsible.

## Goals

- Cover the Build Simple **drill-ins**: after a real RAG + tool turn, every real
  Build-Simple station's "Open full view" opens and renders **real run data**.
- Cover **long-term memory**: a follow-up turn that depends on the first still
  produces a coherent (structurally valid) answer.
- Cover the **hop detail** (click an arrow) and the **Execution Traces** tree.
- Make the suite **self-describing**: each test prints named sub-steps and the run
  ends with a compact pass/fail/skip summary, so the CI log reads like a checklist.

## Non-goals

- No assertions on the model's exact words (structural only — tolerate variability).
- No coverage of Intermediate/Advanced Build components (rerank, RAGLESS,
  DeepAgents, the network chain) — those belong to their own future E2E specs.
- No backend or product behavior change. This spec adds tests + test-harness logging
  only; it must not touch `backend/app/**` or any `frontend/src/**` runtime code.
- Not exhaustively re-testing each drill-in's internals (Vitest already does that) —
  E2E only proves they render **real, non-empty** data against a live trace.

## User-facing behavior

No change to the product UI. The only user-visible change is in the **CI / local
`npm run test:e2e` output**: tests show indented named steps and a final summary
block. Step/summary strings are developer-facing test log text (not product prose),
so the §4 bilingual rule does not apply (see Open questions).

## Acceptance criteria

1. **AC1 — step-level logs** — Each E2E test groups its phases in named
   `test.step(...)` calls so the `list` reporter prints them indented beneath the
   test title (compose → send → settle → the per-test assertions).
2. **AC2 — run summary** — After the suite finishes, a custom reporter prints a
   single compact summary block reporting the count of passed / failed / skipped
   tests and the total duration.
3. **AC3 — long-term memory (multi-turn)** — Given a first turn that establishes a
   fact in the conversation, when a second turn asks a question that depends on that
   fact, then the turn completes and the agent's answer bubble is non-empty (history
   was threaded through; structural assertion only).
4. **AC4 — drill-ins render real data** — Given a completed turn that used both RAG
   and a tool, when the user opens "Open full view" for each **real Build-Simple
   station** (Agent, LLM, MCP Tools, App Database, Backend, Frontend, Vector DB),
   then each overlay opens and shows real run content (non-empty, not an
   empty/placeholder state), and can be closed.
5. **AC5 — hop detail** — Given a completed turn, when the user clicks the
   `frontend → backend` arrow, then the Inspector shows that hop's detail including
   real per-run data (the request that crossed it and/or its forwarded headers).
6. **AC6 — Execution Traces tree** — Given a completed turn, when the user opens the
   Execution Traces view, then a span tree renders with at least one span from the
   real agent loop.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a** (tests only; the stations already exist)

## Open questions (clarify before planning)

- [x] Do the test step / summary strings need en + pt? **No** — they are developer
  test-harness log output, not product UI prose (§4 governs user-facing text). The
  tests select existing UI by stable English labels/testids exactly as the current
  suite does (the app is pinned to `lang=en` in `beforeEach`).
- [x] Where do the new tests live — one file or several? **Several**, one per concern
  (memory / drill-ins / hop / traces), sharing a helpers module — decided in plan.
- [x] Which stations count as "real Build-Simple"? Agent, LLM, MCP Tools, App
  Database, Backend, Frontend, Vector DB (the default selection's real stations;
  RAG + MCP default-on). Storage/Ingestion are upload-only and excluded.

## Out of scope / deferred

- Step/replay (cursor scrub) E2E — valuable (050) but lower priority; deferred.
- "Configure agent" dialog smoke from the Agent node — deferred to a follow-up.
- E2E for Intermediate/Advanced Build components — each gets its own spec.
