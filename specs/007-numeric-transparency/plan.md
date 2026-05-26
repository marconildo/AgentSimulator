# Plan: Deeper numeric transparency

> The HOW for `spec.md` (status **planned** — clarify resolved Q1–Q4). Respects
> `.specify/constitution.md`. Enriches existing event payloads + inspector views;
> no new `Stage`.

## Approach

Add concrete data to three existing surfaces, all read from the trace already in
memory (pure projection, §7):

1. **MCP JSON-RPC** (Q1: reconstruct + label) — when discovering/calling tools,
   attach the JSON-RPC request/response frames to the `mcp.discover`/`mcp.call`
   `data` as `jsonrpc: {request, response, reconstructed}`. A single pure helper
   builds the canonical frames from the real exchange (method/params/result), so
   the shape is identical across transports; `reconstructed` is `true` for
   `local-fallback` (nothing traveled in-process → UI badge "reconstructed (local
   fallback)") and `false` for `mcp-stdio` (these mirror the real wire frames).
   *Note:* `langchain-mcp-adapters` abstracts the stdio transport and does not
   surface the literal frame bytes, so even the stdio frames are assembled from
   the real exchange — they are faithful to the MCP protocol (`tools/list`,
   `tools/call`), and the honesty line we draw is the `reconstructed` flag for the
   in-process fallback.
2. **Request body** (Q2: reconstruct from trace) — enrich the backend `frontend`
   event with a `request` object echoing what the server received/resolved
   (`message`, `session_id`, `top_k` resolved to the default when omitted, `mode`,
   plus `006` overrides when present). The inspector renders it verbatim from the
   trace — no client-side capture, so the body becomes part of the replayable
   trace (pure projection, §7) and AC3's authoritative test is on the backend.
3. **RAG similarity table** (Q3: ranked table only) — `retriever.py` already
   computes `similarity = 1 − distance`; also include `distance` and a stable
   `rank` per chunk in the `rag.retrieve` `data.chunks`, and render a ranked table
   with bars in the RAG inspector. Pairwise chunk-to-chunk similarity is deferred.

*Alternative considered:* a separate `/api/trace/{id}/raw` endpoint for heavy
payloads — rejected; everything needed is already in the trace, and a new fetch
would break the "pure projection" property (§7).

## Affected files

**Backend**
- `backend/app/mcp/client.py` — add a pure `jsonrpc_frames(method, params, result,
  *, reconstructed)` helper returning `{request, response, reconstructed}` (Q1).
  Unit-testable in isolation.
- `backend/app/agent/graph.py` — attach `rec.data["jsonrpc"]` to the
  `mcp.discover` (`tools/list`) and `mcp.call` (`tools/call`) events using the
  helper, with `reconstructed = registry.transport == "local-fallback"`.
- `backend/app/rag/retriever.py` — include `distance`, `similarity`, `rank` per
  chunk in the `rag.retrieve` payload (already computes similarity).
- `backend/app/main.py` — enrich the `frontend` event `data` with a `request`
  object (`message`, `session_id`, `top_k` resolved, `mode`, `006` overrides when
  present) for AC3 (Q2).
- (No `schemas.py` `Stage` change; `TraceEvent.data` is an open dict.)

**Frontend**
- `frontend/src/types/events.ts` — optional typed fields for the inspector:
  `chunks[].distance/rank`, the `mcp` `jsonrpc` frames, the `frontend` `request`
  object. (Types only; not a `Stage` mirror.)
- `frontend/src/components/InspectorPanel.tsx` — extend the `mcp` `renderDetail`
  (collapsible JSON-RPC block), the `frontend` case (request body, read from the
  `frontend` event's `data.request`), and the `rag` case (ranked similarity table
  with bars). Switches stay exhaustive over `StationId`.
- `frontend/src/i18n/strings.ts` — new `inspector.*` labels (en + pt).
- *(No `useChat.ts`/`sse.ts` change — Q2 made the body trace-derived, not
  client-captured.)*

## Protocol changes (constitution §1)

- **No new `Stage`/`Phase`.** Existing events gain `data` keys:
  - `mcp.discover` / `mcp.call` → `data.jsonrpc = {request, response, reconstructed}`.
  - `rag.retrieve` → `data.chunks[].{distance, similarity, rank}`.
  - `frontend` → `data.request = {message, session_id, top_k, mode, …overrides}`
    (Q2 — AC3 is now a trace field).
- `frontend/src/types/events.ts` — add these as **optional** fields so the
  inspector reads them type-safely. This is a content/typing refinement, not a new
  stage; `STAGE_TO_STATION` is untouched.

## Data model changes

None (no DB / vector-store schema change). Payload size (Q4) is **not** truncated:
the corpus is small-k and the tools return short strings, so the in-memory
`TraceStore` (§8) stays modest. Revisit only if a tool starts returning large
payloads.

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
| AC1 | `jsonrpc_frames(...)` is well-formed (`method`/`params`/`result`, `reconstructed` flag) and the `mcp.discover`/`mcp.call` events carry it on **both** transports | `backend/tests/test_mcp.py` |
| AC2 | a tool-calling chat produces non-empty request **and** response frames on the `mcp.call` event | `backend/tests/test_agent.py` |
| AC3 | the `frontend` event's `data.request` carries the resolved body (`message`/`session_id`/`top_k`/`mode`, + overrides when sent) | `backend/tests/test_api.py` |
| AC4 | `rag.retrieve` chunks expose `distance`/`similarity`/`rank`; `similarity == 1 − distance`; ranks ascend by distance | `backend/tests/test_rag.py` |
| AC5 | no new fetch / no new `Stage`; `Stage` enum unchanged; views derive from the trace | `backend/tests/test_protocol.py` + review |
| AC6 | new `inspector.*` labels exist en + pt | `frontend` Vitest (`strings.test.ts`) |

Inspector rendering (the JSON-RPC block, request-body block, ranked table) is
typed against the new optional `events.ts` fields and guarded by `tsc` +
`npm run build`, then verified manually.

## Risks / trade-offs

- **Trace bloat** (Q4 → no truncation): raw frames + body grow each trace;
  accepted because the corpus is small-k and tools return short strings, and
  `TraceStore` is bounded by count (§8). Revisit if a tool returns large payloads.
- **Fallback fidelity** (Q1 → reconstruct + label): the `reconstructed: true` flag
  + "reconstructed (local fallback)" badge keep the in-process path from
  masquerading as real wire traffic — the whole point is honesty (§3).
- **PII/keys**: never include the OpenAI key or full upstream API payloads — only
  the MCP frames and the client's own request body.
- **Type drift**: optional `events.ts` fields must match the backend `data` keys;
  keep them documented here so the two don't diverge (§1 spirit).
