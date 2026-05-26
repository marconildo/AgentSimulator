# Tasks: Deeper numeric transparency

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is
> preceded by the test that must fail first (red → green → refactor). Check boxes
> as you go and advance the spec status (`clarified → in-progress → done`).
>
> Backend tests run against **OpenAI** (CI key secret) with structural assertions.
> **Clarify resolved** (Q1 reconstruct+label · Q2 trace-derived body · Q3 ranked
> table only · Q4 no truncation) — ready to implement.

## Phase 1 — RAG similarity payload (AC4)

- [x] **T1 — test first**: in `backend/tests/test_rag.py`, assert each
  `rag.retrieve` chunk exposes `distance`, `similarity`, `rank`, with
  `similarity == 1 − distance` and ranks stable/ascending by distance.
- [x] **T2 — implement**: include `distance`/`similarity`/`rank` per chunk in
  `retriever.py`'s `rag.retrieve` payload.

## Phase 2 — MCP JSON-RPC frames (AC1, AC2)

- [x] **T3 — test first**: in `test_mcp.py`, unit-test `jsonrpc_frames(...)` —
  well-formed `{request, response, reconstructed}` with `method`/`params` on the
  request and `result` on the response, and `reconstructed` reflecting the
  transport (Q1); assert the `mcp.discover`/`mcp.call` events carry `jsonrpc` on
  **both** transports. In `test_agent.py`, a tool-calling chat yields a non-empty
  request **and** response frame on `mcp.call`.
- [x] **T4 — implement**: add the pure `jsonrpc_frames` helper in `mcp/client.py`;
  attach `rec.data["jsonrpc"]` to the `mcp.discover` (`tools/list`) and `mcp.call`
  (`tools/call`) events in `graph.py`, with `reconstructed = transport ==
  "local-fallback"`. No truncation (Q4).

## Phase 3 — Request body on the trace (AC3)

- [x] **T5 — test first**: in `test_api.py`, assert the `frontend` event's
  `data.request` carries the resolved body — `message`, `session_id`, `top_k`
  (resolved default when omitted), `mode` — and the `006` overrides when sent
  (Q2).
- [x] **T6 — implement**: enrich the `frontend` event `data` in `main.py` with the
  `request` object (`message`, `session_id`, `top_k` resolved, `mode`, overrides
  when present).

## Phase 4 — Inspector views + types (AC2, AC3, AC4, §1-typing)

- [x] **T7 — implement**: add optional `events.ts` fields (`chunks[].distance/
  rank`, mcp `jsonrpc`, `frontend` `request`); extend `InspectorPanel`
  `renderDetail` — collapsible JSON-RPC (mcp), request body read from
  `data.request` (frontend), ranked similarity table with bars (rag).

## Phase 5 — i18n (AC6, §4)

- [x] **T8 — test first**: Vitest i18n parity for the new `inspector.*` keys.
- [x] **T9 — implement**: add the labels en **and** pt in `strings.ts`.

## Phase 6 — Verify & refactor

- [x] **T10 — refactor**: confirm no new `Stage`, no new fetch (AC5); keep payloads
  bounded; switches exhaustive over `StationId`.
- [x] **T11 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (with
  `OPENAI_API_KEY`) · `npm run build` · `npm test`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff` clean · `pytest -q` green (with `OPENAI_API_KEY`)
- [x] `npm run build` + `npm test` pass
- [x] No new `Stage`; optional `events.ts` fields match backend `data` keys; every
      `Stage` still mapped to a station
- [x] Pure projection preserved (no new fetch); payloads bounded (§8)
- [x] All new labels exist in en **and** pt
- [x] `spec.md` status updated to `done`
