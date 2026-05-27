# Plan: Abstain / empty-result badge

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> Structured `found` signal on tool results (robust, not a string heuristic). Backend
> touches the tool contract + the in-process fallback; **no new `Stage`/`Phase`**.

## Approach

Carry a **`found` flag** with each tool result so abstention is detectable structurally:

- **Tool logic** (`server.py`): `_kb_lookup` reports not-found explicitly. Introduce a
  small `ToolResult { content: str, found: bool }` (or a `(content, found)` pair) so the
  miss case is `found: false`; `calculator`/`current_time` are always `found: true`.
- **Registry** (`client.py`): both paths populate `found` — the **local fallback** reads
  it straight from the `_`-prefixed functions; the **MCP-stdio** path preserves it via
  FastMCP structured output (or reconstructs it from the typed result). `ToolRegistry.
  call` returns the structured result so `tools_node` can pass `content` to the model
  **and** record `found`. Both registrations updated together (CLAUDE.md).
- **Trace** (`tools_node`): record `found` on the `Stage.MCP_CALL` END `data`
  (`{ ..., found: false }`). `data` is an open record → no schema type change, no Stage.
- **Frontend predicate** (pure): `abstained(data)` → `data.found === false` (AC1).
- **UI** (`AgentDetail`): in the tool-calls list, a call with `abstained` true gets the
  badge bound to that call; others get none (AC2).

*Alternatives considered:* string-matching the "No … found" shape — rejected in clarify
(brittle; breaks on rewording/i18n). Only-kb_lookup scope — rejected: the general
predicate over the structured signal is future-proof.

## Affected files

**Backend**
- `backend/app/mcp/server.py` — `_kb_lookup` (+ the `@mcp.tool()` `kb_lookup`) report a
  structured `found`; calculator/current_time default found.
- `backend/app/mcp/client.py` — `ToolResult`/structured `call` result; **both**
  `_load_local()` and `_load_via_mcp()` carry `found` (the two mirrors stay in lockstep).
- `backend/app/agent/graph.py` — `tools_node` records `found` on the `mcp.call` END
  `data`; the model observation is still the `content` text.

**Frontend**
- `frontend/src/lib/abstain.ts` *(new)* — `abstained(data)` predicate (pure).
- `frontend/src/lib/abstain.test.ts` *(new)* — AC1 (true for empty/not-found, false for
  substantive).
- `frontend/src/types/events.ts` — optional tool-result data shape (`{ found?: boolean }`)
  for safe reading (no required type change — `data` stays open).
- `frontend/src/components/AgentDetail.tsx` — render the abstain badge on the matching
  tool call in the tool-calls list.
- `frontend/src/i18n/strings.ts` — badge text (en + pt).

## Protocol changes (constitution §1)

No new `Stage`/`Phase`. The `found` flag is a field inside the open `data` record of the
existing `mcp.call` event (a data convention) — mirrored as an **optional** TS shape, not
a required `TraceEvent` type change. The tool-contract change (`ToolResult`) is
backend-internal.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `abstain.badge` | Tool returned empty — agent abstained | Ferramenta vazia — o agente absteve-se |
| `abstain.hint` | No result found for this sub-query. | Nenhum resultado para esta sub-consulta. |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `abstained(data)` is true for `found:false`/empty, false for a substantive result | `frontend/src/lib/abstain.test.ts` |
| AC1b (backend) | a `kb_lookup` miss records `found:false` on the `mcp.call` data; a hit records `found:true` — on **both** transports | `backend/tests/test_mcp.py` |
| AC2 | a tool call classified empty renders the badge; a non-empty call renders none | manual UI + `abstain.test.ts` shape |
| AC3 | badge text exists in en **and** pt | i18n parity test |

## Risks / trade-offs

- **MCP structured output.** The `found` flag must survive the stdio transport
  (FastMCP structured output / langchain-mcp-adapters), not just the local fallback. A
  backend test asserts parity across **both** paths; if the adapter flattens the result,
  reconstruct `found` from the typed result at the registry boundary.
- **Two mirrors.** `server.py` `@mcp.tool()` and `client.py` `_load_local()` must change
  together (the long-standing CLAUDE.md rule) — the both-transports test guards drift.
- **Backend overlap.** 021 touches `mcp/*` + `graph.py`; 016 touches `main.py`; 017
  touches `graph.py`/`schemas.py`. Sequence 017 → 021 so the `graph.py` edits don't
  collide; `abstain.ts` is conflict-free.
- **AgentDetail hot file (019/020/021).** Different waves.
