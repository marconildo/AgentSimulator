# Plan: Deeper numeric transparency

> The HOW for `spec.md` (status `draft` — finalize after clarify). Respects
> `.specify/constitution.md`. Enriches existing event payloads + inspector views;
> no new `Stage`.

## Approach

Add concrete data to three existing surfaces, all read from the trace already in
memory (pure projection, §7):

1. **MCP JSON-RPC** — when discovering/calling tools, attach the JSON-RPC
   request/response frames to the `mcp.discover`/`mcp.call` `data` (`jsonrpc:
   {request, response}`). For the stdio transport these are the real frames; for
   the local-fallback they are reconstructed to mirror stdio (Q1).
2. **Request body** — capture the exact `POST /api/chat` body on the client (in
   `useChat.send`/the SSE client) and stash it in the store, so the inspector can
   render it verbatim (Q2).
3. **RAG similarity table** — `retriever.py` already computes `similarity = 1 −
   distance`; also include `distance` and a stable `rank` per chunk in the
   `rag.retrieve` `data.chunks`, and render a ranked table with bars in the RAG
   inspector.

*Alternative considered:* a separate `/api/trace/{id}/raw` endpoint for heavy
payloads — rejected; everything needed is already in the trace/client, and a new
fetch would break the "pure projection" property (§7).

## Affected files

**Backend**
- `backend/app/mcp/client.py` — capture/emit JSON-RPC frames for discovery and
  calls (stdio: real; fallback: reconstructed, Q1); add to event `data`.
- `backend/app/rag/retriever.py` — include `distance`, `similarity`, `rank` per
  chunk in the `rag.retrieve` payload (already computes similarity).
- `backend/app/agent/graph.py` — pass the enriched MCP/RAG data through unchanged
  (it flows via the emitter `data`).
- (No `schemas.py` `Stage` change; `TraceEvent.data` is an open dict.)

**Frontend**
- `frontend/src/types/events.ts` — optional typed fields for the inspector:
  `chunks[].distance/rank`, `mcp …jsonrpc`. (Types only; not a `Stage` mirror.)
- `frontend/src/components/InspectorPanel.tsx` — extend the `mcp` `renderDetail`
  (collapsible JSON-RPC block), the `frontend`/`backend` case (request body), and
  the `rag` case (ranked similarity table with bars). Switches stay exhaustive
  over `StationId`.
- `frontend/src/store/useChat.ts` (+ `lib/sse.ts`/`chatApi.ts`) — stash the exact
  request body for the inspector (Q2); or read it from the `frontend` event.
- `frontend/src/i18n/strings.ts` — new `inspector.*` labels (en + pt).

## Protocol changes (constitution §1)

- **No new `Stage`/`Phase`.** Existing events gain `data` keys:
  - `mcp.discover` / `mcp.call` → `data.jsonrpc = {request, response}`.
  - `rag.retrieve` → `data.chunks[].{distance, similarity, rank}`.
- `frontend/src/types/events.ts` — add these as **optional** fields so the
  inspector reads them type-safely. This is a content/typing refinement, not a new
  stage; `STAGE_TO_STATION` is untouched.
- Request body (AC3) is **client state**, not a trace field.

## Data model changes

None (no DB / vector-store schema change). Watch payload size (Q4): truncate large
JSON-RPC results / bodies so the in-memory `TraceStore` stays bounded (§8).

## i18n strings (constitution §4)

All en **and** pt.

| key / location | en | pt |
|---|---|---|
| `inspector.jsonrpc` | JSON-RPC frames | Frames JSON-RPC |
| `inspector.request` | Request | Requisição |
| `inspector.response` | Response | Resposta |
| `inspector.requestBody` | Request body | Corpo da requisição |
| `inspector.rank` | rank | posição |
| `inspector.distance` | distance | distância |
| `inspector.similarity` | similarity | similaridade |
| `inspector.reconstructed` | reconstructed (local fallback) | reconstruído (fallback local) |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Backend payload shape tested against OpenAI; **structural** assertions.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `mcp.discover`/`mcp.call` carry well-formed `jsonrpc` {request,response} on both transports | `backend/tests/test_mcp.py` |
| AC2 | a tool-calling chat produces non-empty request+response frames | `backend/tests/test_agent.py` |
| AC3 | the request body is captured client-side and matches what was sent | `frontend` Vitest (store) + manual |
| AC4 | `rag.retrieve` chunks expose `distance`/`similarity`/`rank`; `similarity == 1 − distance` | `backend/tests/test_rag.py` |
| AC5 | no new fetch / no new `Stage`; views derive from trace + client state | `backend/tests/test_protocol.py` + review |
| AC6 | new `inspector.*` labels exist en + pt | `frontend` Vitest i18n parity |

Inspector rendering is guarded by `tsc` + `npm run build` and verified manually.

## Risks / trade-offs

- **Trace bloat** (Q4): raw frames + large bodies grow each trace; truncate and/or
  cap, since `TraceStore` is bounded in-memory (§8).
- **Fallback fidelity** (Q1): reconstructed JSON-RPC must be clearly equivalent to
  stdio or labeled, so it doesn't mislead (the whole point is honesty).
- **PII/keys**: never include the OpenAI key or full upstream API payloads — only
  the MCP frames and the client's own request body.
- **Type drift**: optional `events.ts` fields must match the backend `data` keys;
  keep them documented here so the two don't diverge (§1 spirit).
