# Plan: Backend lifecycle flowchart

## Approach

Extend the 076 `selectBackend` projection into a richer `selectBackendFlow(events)` that
returns the five ordered orchestration steps with each step's real data + latency, then
rewrite `BackendDetail.tsx` to render a **vertical flowchart**: a column of step cards
joined by directional connectors (a down-arrow + a small hop label). Each card shows its
payload; the agent card shows a compact ReAct summary (counts + tool names) and a
bilingual pointer to the Agent/LLM/MCP full views.

The flowchart is plain CSS/flex (no React-Flow inside the overlay) — a numbered step
card + a connector element between cards. Steps render dim/pending when their event is
absent from the visible cursor slice; the whole overlay shows the empty-state when the
turn hasn't started.

Alternatives considered: (a) embed a mini React-Flow graph — rejected as overkill and
heavier to keep replay-synced; (b) keep flat cards and just add more rows — rejected,
the user explicitly wants a *flow*.

## Affected files

**Frontend**
- `frontend/src/lib/stationDetail.ts` — add `selectBackendFlow` (+ `BackendFlow`,
  `BackendFlowStep` types); reuse existing `selectMcp`/`electedToolCalls` for the agent
  step's tool/retrieval counts. Keep `selectBackend` or fold it in.
- `frontend/src/components/BackendDetail.tsx` — rewrite to render the flowchart; add a
  small `FlowStep` + `Connector` presentational helper (local to the file).
- `frontend/src/components/BackendDetail.test.tsx` — extend for the five steps + agent
  summary + pending/empty.
- `frontend/src/i18n/strings.ts` (+ pt) — new `backendDetail` step/hop/summary keys.

## Protocol changes (constitution §1)

None.

## Data model changes

None.

## i18n strings (constitution §4)

New keys under `backendDetail` (en / pt):

| key | en | pt |
|---|---|---|
| intro | The backend orchestrates the turn — it coordinates each step below. | O backend orquestra o turno — coordena cada etapa abaixo. |
| stepReceive | Payload received | Payload recebido |
| stepHistory | Load history | Carrega histórico |
| stepAgent | AI agent invoked | Agente de IA invocado |
| stepPersist | Persist conversation | Persiste a conversa |
| stepRespond | Response streamed back | Resposta devolvida |
| hopReceive | HTTPS · POST | HTTPS · POST |
| hopRead | SQL · read | SQL · leitura |
| hopInvoke | in-process | em processo |
| hopWrite | SQL · write | SQL · escrita |
| hopRespond | HTTPS · SSE | HTTPS · SSE |
| rowsLoaded | Rows loaded | Linhas carregadas |
| reasoningRounds | Reasoning rounds | Rodadas de raciocínio |
| toolCalls | Tool calls | Chamadas de ferramenta |
| retrievals | Retrievals | Recuperações |
| agentHint | Open the Agent · LLM · MCP full views for the inner detail. | Abra as visões completas do Agente · LLM · MCP para o detalhe interno. |
| pending | waiting… | aguardando… |

(`message`/`delivery`/`session`/`answer`/`latency` reused from 076.)

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

Vitest (FE-only). Synthetic `TraceEvent[]` through the store → component.

| AC | Test | File |
|---|---|---|
| AC1 ordered flow | five step titles render in order | `BackendDetail.test.tsx` |
| AC2 payload | message + request body JSON shown | same |
| AC3 history | db.read rows shown | same |
| AC4 agent summary | rounds + tool name + retrieval count + hint | same |
| AC5 persist | db.write row id / total shown | same |
| AC6 response | answer + delivery + latency shown | same |
| AC7 pending/empty | pending step when event absent; empty-state with no trace | same |
| AC8 bilingual | strings exist en+pt (tsc `Record` parity) | build |

## Risks / trade-offs

- Keeping the agent step a *summary* (not a duplicate of the Agent drill-in) avoids
  divergence; it reuses the same `electedToolCalls` helper the MCP view uses.
- Pure projection → replay-safe by construction (same pattern as 076).
