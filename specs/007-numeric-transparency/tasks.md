# Tasks: Deeper numeric transparency

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is
> preceded by the test that must fail first (red → green → refactor). Check boxes
> as you go and advance the spec status (`clarified → in-progress → done`).
>
> Backend tests run against **OpenAI** (CI key secret) with structural assertions.
> **Blocked on clarify** — resolve Q1–Q4 before T2.

## Phase 1 — RAG similarity payload (AC4)

- [ ] **T1 — test first**: in `backend/tests/test_rag.py`, assert each
  `rag.retrieve` chunk exposes `distance`, `similarity`, `rank`, with
  `similarity == 1 − distance` and ranks stable/ascending by distance.
- [ ] **T2 — implement**: include `distance`/`similarity`/`rank` per chunk in
  `retriever.py`'s `rag.retrieve` payload.

## Phase 2 — MCP JSON-RPC frames (AC1, AC2)

- [ ] **T3 — test first**: in `test_mcp.py`, `mcp.discover`/`mcp.call` carry a
  well-formed `jsonrpc` `{request, response}` on **both** the stdio and
  local-fallback transports (Q1); in `test_agent.py`, a tool-calling chat yields
  non-empty request **and** response frames.
- [ ] **T4 — implement**: capture/emit JSON-RPC frames in `mcp/client.py`
  (stdio real; fallback reconstructed/labeled), bounded in size (Q4).

## Phase 3 — Request body capture (AC3)

- [ ] **T5 — test first**: a frontend Vitest test asserts `useChat.send` stashes
  the exact request body (message/session_id/top_k/mode/overrides) for the
  inspector (Q2).
- [ ] **T6 — implement**: capture the body in `useChat.send`/`sse.ts` and expose
  it via the store (or read it from the `frontend` event's `data`).

## Phase 4 — Inspector views + types (AC2, AC3, AC4, §1-typing)

- [ ] **T7 — implement**: add optional `events.ts` fields (`chunks[].distance/
  rank`, mcp `jsonrpc`); extend `InspectorPanel` `renderDetail` — collapsible
  JSON-RPC (mcp), request body (frontend/backend), ranked similarity table with
  bars (rag).

## Phase 5 — i18n (AC6, §4)

- [ ] **T8 — test first**: Vitest i18n parity for the new `inspector.*` keys.
- [ ] **T9 — implement**: add the labels en **and** pt in `strings.ts`.

## Phase 6 — Verify & refactor

- [ ] **T10 — refactor**: confirm no new `Stage`, no new fetch (AC5); keep payloads
  bounded; switches exhaustive over `StationId`.
- [ ] **T11 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (with
  `OPENAI_API_KEY`) · `npm run build` · `npm test`.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff` clean · `pytest -q` green (with `OPENAI_API_KEY`)
- [ ] `npm run build` + `npm test` pass
- [ ] No new `Stage`; optional `events.ts` fields match backend `data` keys; every
      `Stage` still mapped to a station
- [ ] Pure projection preserved (no new fetch); payloads bounded (§8)
- [ ] All new labels exist in en **and** pt
- [ ] `spec.md` status updated to `done`
