# Plan: Interactive experiments (prompt, tools, top-k)

> The HOW for `spec.md` (status `clarified`). Respects
> `.specify/constitution.md`. Touches backend (request inputs + agent wiring) and
> frontend (controls + request plumbing). No new `Stage`.

## Approach

Thread three optional **request inputs** through the existing pipeline without
adding stations or stages:

1. **System prompt** — `ChatRequest.system_prompt` flows into `run_agent` →
   `AgentState` → the graph passes it as the `system=` argument the provider's
   `decide`/`stream_answer` **already accept** (today the graph hardcodes
   `SYSTEM_PROMPT`). Full replace (Q3); blank/whitespace falls back to the
   default. `prompt_preview["system"]` already reflects whatever `system` is
   passed — so AC1 needs **no provider change**, only the graph wiring.
2. **Tool toggles** — `ChatRequest.enabled_tools` filters the `ToolRegistry` so
   only enabled tools are discovered (`mcp.discover`) and offered to the agent
   (`think`). The cached registry is never mutated: a new `specs(enabled)` view
   filters by name; `route`/`think` read `state["enabled_tools"]`. Disabled tools
   are absent end-to-end (everything is real — §3).
3. **top-k** — `ChatRequest.top_k` (already present, now bounded `1..8`) is
   surfaced as a UI slider and honored by `retrieve`.

Frontend adds the controls **inside the existing ⚙️ `SettingsPanel`** (Q5 —
widened + scrollable), backed by a new **per-conversation** `useExperiment` store
(in-memory, Q4), removes the "SOON" Tools/RAG rows, and passes the overrides via
`streamChat`/`batchChat`. Default prompt text / tool list / top-k bounds are
fetched from a new `GET /api/config` so nothing is hardcoded client-side.

*Alternative considered:* server-side global config toggles — rejected; per-request
inputs keep the app single-instance and stateless (§8) and let each send be a
clean experiment.

## Affected files

**Backend**
- `backend/app/schemas.py` — `ChatRequest.system_prompt: str | None`
  (`max_length=2000`), `ChatRequest.enabled_tools: list[str] | None`; tighten
  `top_k` to `Field(None, ge=1, le=8)`. (No `TraceEvent` change.)
- `backend/app/agent/state.py` — `AgentState` gains `system_prompt: str | None`,
  `enabled_tools: list[str] | None`.
- `backend/app/agent/graph.py` — `run_agent(...)` accepts the overrides and seeds
  state; `route`/`think` filter discovery via `registry.specs(enabled)`;
  `think`/`generate` pass the effective system prompt (`override or SYSTEM_PROMPT`,
  blank ⇒ default) as `system=`.
- `backend/app/mcp/client.py` — `ToolRegistry.specs(enabled: list[str] | None =
  None)` returns a filtered view (order-preserving) honored on both stdio and
  local-fallback paths; `call()` refuses a disabled tool defensively.
- `backend/app/llm/provider.py` + `openai_provider.py` — **no change**: `decide`/
  `stream_answer` already take `system` and `prompt_preview` already echoes it.
- `backend/app/main.py` — pass `system_prompt`/`enabled_tools`/`top_k` from
  `ChatRequest` into the single `run_agent` call (shared by stream + batch); add
  `GET /api/config` (default prompt, tools, top-k default/bounds).

**Frontend**
- `frontend/src/lib/experiment.ts` *(new)* — `useExperiment` Zustand store:
  `byConv: Record<string, ConvExperiment>` (`{systemPrompt: string|null;
  enabledTools: string[]|null; topK: number|null}`), `get(conv)`,
  `setSystemPrompt`/`toggleTool`/`setTopK`/`reset(conv)`, and `adopt(from,to)` to
  migrate a draft's settings onto a newly-persisted conversation. In-memory only.
- `frontend/src/lib/chatApi.ts` — `getConfig()` fetching `GET /api/config`;
  `AppConfig` type.
- `frontend/src/lib/sse.ts` — `streamChat`/`batchChat` accept an optional
  `overrides` arg and spread `system_prompt`/`enabled_tools`/`top_k` into the body
  (undefined ⇒ omitted, preserving AC5).
- `frontend/src/store/useChat.ts` — `send` reads the active conversation's
  overrides from `useExperiment` and passes them; `ensureSession` calls
  `adopt("__draft__", id)`.
- `frontend/src/components/SettingsPanel.tsx` — widen + scroll; add System prompt
  (textarea + reset), Tools (checkbox per tool) and Retrieval (top-k slider)
  sections, scoped to `useChat.activeSessionId`; **delete the SOON Tools/RAG
  rows**.
- `frontend/src/i18n/strings.ts` — new bilingual `settings.experiment.*` labels +
  per-tool labels; remove the now-unused `soon`/`tools`/`rag`/`moreSoon` strings.

## Protocol changes (constitution §1)

- `ChatRequest` gains `system_prompt` and `enabled_tools` (request-only). These
  are **not** `Stage`/`Phase`/`TraceEvent` changes, so `events.ts` needs **no**
  mirror. The agent's existing events (`mcp.discover`, `mcp.call`, `llm.prompt`,
  `rag.retrieve`) change only their **content** to reflect the overrides.
- New REST endpoint `GET /api/config` (read-only, inspectable without a key like
  `/api/health`): `{ default_system_prompt, default_top_k, top_k_min, top_k_max,
  tools: [{name, description}] }`. Not part of the *event* protocol.
- API-contract note: the new request fields stay optional (AC5 — defaults
  preserve today's behavior).

## Data model changes

None (no DB or vector-store schema change). Experiment settings are client state,
held **per conversation in memory** (Q4 — no `localStorage`; resets on reload).

## i18n strings (constitution §4)

All en **and** pt. Lives under `settings.experiment.*`. Removes the misleading
`soon`/`tools`/`rag`/`moreSoon` rows.

| key / location | en | pt |
|---|---|---|
| `settings.experiment.title` | Experiment | Experimentar |
| `settings.experiment.systemPrompt` | System prompt | Prompt de sistema |
| `settings.experiment.promptHint` | Edit the agent's instructions and watch the prompt change. | Edite as instruções do agente e veja o prompt mudar. |
| `settings.experiment.reset` | Reset to default | Restaurar padrão |
| `settings.experiment.tools` | Tools (MCP) | Ferramentas (MCP) |
| `settings.experiment.toolsHint` | Turn tools off and watch the agent re-plan. | Desligue ferramentas e veja o agente replanejar. |
| `settings.experiment.topK` | Retrieved chunks (top-k) | Trechos recuperados (top-k) |
| `settings.experiment.topKHint` | How many chunks RAG pulls per query. | Quantos trechos o RAG busca por consulta. |
| `settings.experiment.toolLabels.calculator` | Calculator | Calculadora |
| `settings.experiment.toolLabels.current_time` | Current time | Hora atual |
| `settings.experiment.toolLabels.kb_lookup` | Glossary lookup | Consulta ao glossário |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Backend tests run against OpenAI; **structural** assertions.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `system_prompt` override → `llm.prompt` preview contains it; answer non-empty | `backend/tests/test_agent.py`, `test_api.py` |
| AC2 | `enabled_tools` without `calculator` → `mcp.discover` lists only enabled; no `mcp.call` to calculator on a math Q | `backend/tests/test_mcp.py`, `test_agent.py` |
| AC3 | `enabled_tools=[]` → no `mcp.call`, answer still returned | `backend/tests/test_agent.py` |
| AC4 | `top_k` honored → `rag.retrieve` returns ≤ k chunks, event reflects k | `backend/tests/test_rag.py`, `test_api.py` |
| AC5 | no overrides → default prompt, 3 tools discovered, default top-k (regression) | `backend/tests/test_agent.py`, `test_api.py` |
| AC6 | `GET /api/config` returns prompt/tools/top-k bounds; labels en+pt parity | `backend/tests/test_api.py`; `frontend/src/i18n/strings.test.ts` (Vitest) |
| AC7 | per-conversation store: edit on A, switch to B ⇒ B's own settings; draft adopted on persist | `frontend/src/lib/experiment.test.ts` (Vitest) |

## Risks / trade-offs

- **Prompt injection / breakage** (Q3): a free-form system prompt can make the
  agent misbehave; keeping the tool-use scaffolding non-editable limits the blast
  radius while still teaching.
- **Disabled-tool variability** (Q2): with the calculator off, the model's math
  answer is non-deterministic — assert only "no calculator call", never exact math.
- **Registry filtering** must apply to **both** the MCP-stdio and local-fallback
  paths so the UI behaves identically (the `transport` seam in `client.py`).
- **Backwards compatibility (AC5)** is the load-bearing guard — all fields stay
  optional with today's defaults.
