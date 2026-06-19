# Plan: Full-view drill-ins for MCP, App Database, Backend & Frontend

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Follow the **existing per-station overlay pattern** (`AgentDetail.tsx`,
`LLMDetail.tsx`): one focused component per station, rendered as a sibling overlay in
`App.tsx`, keyed off the store `detail` flag, reading the same `events`+`cursor` slice
the canvas projects. No new store state, no new stages, no backend change — every
panel is a **pure projection** of already-captured `TraceEvent`s.

Extend the existing **`HAS_DETAIL`** map in `StationNode.tsx` so the four nodes grow
the "Open full view" button for free (the button block already lives outside the
expand ternary). The label for these four resolves to the existing `t.node.openFull`
(the rag/pageindex special-cases stay as-is).

Extract a small shared **`DetailShell`** (header with `←` back + icon + title/subtitle,
backdrop, empty-state) so the four new overlays don't duplicate the chrome that
AgentDetail/LLMDetail hand-roll. Keep the data panels per-station.

**Reuse existing projection logic** rather than inventing parsers:
- MCP: the same selectors the Inspector's `case "mcp"` uses — `pick(events,
  "mcp.discover","end")`, `events.filter(mcp.call/end)`, and `electedToolCalls(...)`
  for DeepAgents local calls. Hoist these into a `lib/stationDetail.ts` (or reuse
  `eventLog`/existing helpers) so both Inspector and overlay read identically.
- Database / Backend / Frontend: read the relevant stage end events' `data` directly
  (db.read/db.write/backend/frontend) + the streamed answer from `deriveView`.

Alternatives considered: (a) one generic data-driven overlay for all stations —
rejected for now (spec out-of-scope; the four shapes differ enough that the per-station
components stay readable). (b) Rendering richer data *inside* the Inspector — rejected:
the user explicitly wants the Inspector reserved for theory and a dedicated full view
for data, matching agent/llm.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/components/nodes/StationNode.tsx` — add `mcp`, `database`, `backend`,
  `frontend` to `HAS_DETAIL` (label falls through to `t.node.openFull`).
- `frontend/src/components/DetailShell.tsx` — **new** shared overlay chrome (header,
  back button, backdrop, empty state). Optional refactor target; AgentDetail/LLMDetail
  may stay untouched.
- `frontend/src/components/McpDetail.tsx` — **new** (discovery + every tool call + JSON-RPC).
- `frontend/src/components/DatabaseDetail.tsx` — **new** (db.read + db.write payloads).
- `frontend/src/components/BackendDetail.tsx` — **new** (request received + response assembled).
- `frontend/src/components/FrontendDetail.tsx` — **new** (sent request + received answer).
- `frontend/src/App.tsx` — render the four overlays keyed on `detail` (siblings of
  AgentDetail/LLMDetail), inside `canvasContent`.
- `frontend/src/lib/stationDetail.ts` — **new** (optional) shared selectors so Inspector
  + overlays read MCP/DB/backend/frontend trace data identically.
- `frontend/src/i18n/strings.ts` (+ pt) — new `mcpDetail` / `dbDetail` / `backendDetail`
  / `frontendDetail` string blocks (title/subtitle/back/empty + section labels), en+pt.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed; `schemas.py` ↔ `events.ts`
untouched; `STAGE_TO_STATION` / `STAGE_TO_PHASE` unchanged; no new `readoutFor` /
`renderDetail` case (those switches already cover these four stations).

## Data model changes

None — vector store and relational store untouched.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `mcpDetail.title` | MCP Tools — calls this turn | MCP Tools — chamadas deste turno |
| `mcpDetail.subtitle` | JSON-RPC over the MCP transport | JSON-RPC sobre o transporte MCP |
| `mcpDetail.back` | Back | Voltar |
| `mcpDetail.empty` | No tool activity in this turn yet. | Nenhuma atividade de ferramenta neste turno ainda. |
| `dbDetail.title` | App Database — operations this turn | Banco da Aplicação — operações deste turno |
| `dbDetail.subtitle` | Read history · persist conversation | Lê histórico · persiste conversa |
| `dbDetail.back` / `dbDetail.empty` | Back / No database activity yet. | Voltar / Nenhuma atividade de banco ainda. |
| `backendDetail.title` | Backend — request lifecycle | Backend — ciclo da requisição |
| `backendDetail.subtitle` | FastAPI edge · request → response | Borda FastAPI · requisição → resposta |
| `backendDetail.back` / `.empty` | Back / Nothing received yet. | Voltar / Nada recebido ainda. |
| `frontendDetail.title` | Frontend — what the browser exchanged | Frontend — o que o navegador trocou |
| `frontendDetail.subtitle` | POST request · streamed answer | Requisição POST · resposta transmitida |
| `frontendDetail.back` / `.empty` | Back / Nothing sent yet. | Voltar / Nada enviado ainda. |
| section labels (request / response / read / write / discovery / call / args / result / frames) | reuse existing `inspector.*` keys where they exist | idem |

(Exact final wording is finalized in the strings file; both languages land together.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary. Existing `clouds` maps untouched.

## Test strategy (constitution §9 — TDD)

Frontend Vitest only (FE-only feature). Each AC → at least one structural test that
feeds a synthetic `TraceEvent[]` through the store/component and asserts on rendered
structure (tolerant, not pixel-exact).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 button parity | StationNode renders full-view button for mcp/database/backend/frontend; none for a comingSoon station | `frontend/src/components/StationNode.fullview.test.tsx` |
| AC2 open/close toggle | clicking button toggles store `detail`; back button closes | `frontend/src/components/StationNode.fullview.test.tsx` + per-overlay test |
| AC3 MCP full view | N calls + discovery + JSON-RPC frames + local DeepAgents calls rendered | `frontend/src/components/McpDetail.test.tsx` |
| AC4 DB full view | db.read + db.write payloads both rendered | `frontend/src/components/DatabaseDetail.test.tsx` |
| AC5 Backend full view | request body + assembled response rendered | `frontend/src/components/BackendDetail.test.tsx` |
| AC6 Frontend full view | sent message/overrides + streamed answer rendered | `frontend/src/components/FrontendDetail.test.tsx` |
| AC7 pure projection + empty | overlay reads events/cursor slice; empty-state with no trace | each overlay test (empty-state case) |
| AC8 Inspector unchanged | existing InspectorPanel mcp/db/backend/frontend tests still green | existing suites (regression) |

## Risks / trade-offs

- **Duplication vs the Inspector.** MCP/DB data selectors risk drifting from the
  Inspector's. Mitigation: hoist shared selectors into `lib/stationDetail.ts` and have
  both call them (one source of truth), or at minimum mirror them with a shared test.
- **Overlay chrome divergence.** Extracting `DetailShell` touches a visual contract;
  keep AgentDetail/LLMDetail as-is to avoid churn unless the refactor is clean.
- **Determinism.** Pure projection of captured events → step/replay safe by
  construction (same pattern as LLMDetail), no new async.
- Single-instance / protocol assumptions: untouched.
