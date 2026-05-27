# Tasks: Abstain / empty-result badge

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Clarify resolved** — structured `found` signal · any tool (`spec.md`, 2026-05-27).
> Touches `mcp/*` + `graph.py` — sequence after 017 (shared `graph.py`).

## Phase 1 — Structured `found` across both transports (AC1 backend)

- [ ] **T1 — test first**: `backend/tests/test_mcp.py` — a `kb_lookup` miss yields a
  result with `found: false`; a hit yields `found: true`; assert parity on **both** the
  local fallback **and** the MCP-stdio path.
- [ ] **T2 — implement**: `server.py` `_kb_lookup`/`@mcp.tool()` report structured
  `found`; `client.py` `ToolResult` + both `_load_local()` and `_load_via_mcp()` carry
  it; `tools_node` records `found` on the `mcp.call` END `data` (content still the model
  observation).

## Phase 2 — Pure predicate (AC1 frontend)

- [ ] **T3 — test first**: `frontend/src/lib/abstain.test.ts` — `abstained(data)` is true
  for `found:false`/empty and false for a substantive result.
- [ ] **T4 — implement**: `frontend/src/lib/abstain.ts` (`abstained`); add the optional
  tool-result data shape to `frontend/src/types/events.ts`.

## Phase 3 — i18n (AC3, §4)

- [ ] **T5 — test first**: parity — `abstain.*` strings exist in en **and** pt.
- [ ] **T6 — implement**: add the strings to `frontend/src/i18n/strings.ts` (en + pt).

## Phase 4 — Badge in Agent anatomy (AC2)

- [ ] **T7 — implement**: in `frontend/src/components/AgentDetail.tsx`, render the abstain
  badge bound to the matching tool call in the tool-calls list; non-empty calls get none.
  Tokens only (theme guard).

## Phase 5 — Verify & refactor

- [ ] **T8 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (both transports) ·
  `npm test` · `npm run build` — all green. No new `Stage`/`Phase`; `data` stays open.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC3)
- [ ] `found` carried on **both** MCP-stdio and local-fallback (parity test green)
- [ ] `@mcp.tool()` and `_load_local()` mirrors updated together
- [ ] No new `Stage`/`Phase`/`TraceEvent` type; `found` lives in open `data`
- [ ] Badge text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
