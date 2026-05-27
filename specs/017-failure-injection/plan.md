# Plan: Failure injection (watch the agent degrade)

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> A **request-only** input on the 006/008 pattern — **no new pipeline `Stage`**, no new
> `TraceEvent` type. Failures surface as an `error` key on existing END-event `data`.

## Approach

`simulate_failure` rides the exact rails `scenario` (008) and the 006 overrides already
use: an optional field on `ChatRequest` → `AgentState` → the nodes; omitted/`none`
reproduces today's run byte-for-byte (AC1). Two deterministic injection points:

- **`tool_error`** — in `tools_node`, when `state["simulate_failure"] == "tool_error"`,
  the tool call short-circuits to a **simulated error observation** instead of calling
  `registry.call`: the `Stage.MCP_CALL` END `data` gets `{ error, simulated: true }`,
  and the *observation fed back to the model* is that error text. The ReAct loop then
  lets the model **reason over the failure and degrade/abstain** — the reaction is
  genuinely the model's, observable on the canvas, and the run reaches a terminal state
  (AC2). No 500.
- **`llm_timeout`** — in `think_node` (the first model call, inside `Stage.LLM_PROMPT`),
  when `simulate_failure == "llm_timeout"` the model call raises a **simulated
  `TimeoutError`** that the node catches: it records `{ error, simulated: true }` on the
  stage `data`, sets a **degraded answer** (a fixed "the model timed out" message), and
  routes to `respond` so the run ends in a **clean degraded state** — no hang, no
  unhandled 500 (AC3). `generate_node` also guards on the flag so it never makes a real
  call after a timeout.

`GET /api/config` advertises the allowed values (`failure_modes`) so the frontend never
hardcodes them (AC4). The control lives in the ⚙ `SettingsPanel`, stored **per
conversation** in `useExperiment` (persistent until toggled back to `off`), and is sent
via `overridesFor` — which **omits** it when `none`, preserving AC1.

*Alternatives considered:* (a) a structured error `Phase`/typed field — rejected in
clarify (heavier; touches §1 + the `TraceEvent` contract). (b) forcing a retry path —
rejected: less natural than letting the model react to the error observation, and more
fragile to test. (c) auto-reset after one turn — rejected: inconsistent with the 006
per-conversation persistence model.

## Affected files

**Backend**
- `backend/app/schemas.py` — `class SimulateFailure(StrEnum)` (`none|tool_error|
  llm_timeout`); add `simulate_failure: SimulateFailure = NONE` to `ChatRequest`.
- `backend/app/agent/state.py` — `simulate_failure: str` on `AgentState`.
- `backend/app/agent/graph.py` — `run_agent(..., simulate_failure="none")` threads it
  into state; `tools_node` injects the tool error observation; `think_node` /
  `generate_node` inject + handle the timeout (degraded answer → respond).
- `backend/app/main.py` — pass `req.simulate_failure` into `run_agent`; add
  `failure_modes` to the `/api/config` payload and `simulate_failure` to `request_body`.

**Frontend**
- `frontend/src/lib/experiment.ts` — add `simulateFailure` to `ConvExperiment`
  (default `"none"`), a `setSimulateFailure`, and emit `simulate_failure` from
  `overridesFor` **only when ≠ none** (AC1); add it to `ChatOverrides`.
- `frontend/src/types/events.ts` — add `simulate_failure?: string` to the request
  `RequestBody` mirror; optional `SimulatedError` data shape (`{ error: string;
  simulated: boolean }`) for the inspector (no schema *type* change — `data` stays open).
- `frontend/src/lib/config.ts` (or the existing config hook) — surface `failure_modes`.
- `frontend/src/components/SettingsPanel.tsx` — the "Simulate failure" selector
  (off / tool error / llm timeout), options from `failure_modes`.
- `frontend/src/components/FlowCanvas.tsx` / `InspectorPanel.tsx` — show `data.error`
  (badged "simulated") on the MCP / LLM station readout when present.
- `frontend/src/i18n/strings.ts` — selector + option labels + the degraded/error text.

## Protocol changes (constitution §1)

**No new `Stage`/`Phase`/`TraceEvent` type.** The only schema addition is the
request-only `ChatRequest.simulate_failure` enum (mirrored in the TS request type) —
like `scenario`/006. Failures are an `error` key inside the open `data` record of
existing END events; this is a data convention, not a contract type change.

## Data model changes

None. (A `tool_error` run does still `db.write` a normal turn — the *failure* is in the
trace `data`, the conversation persists as usual. An `llm_timeout` run persists its
degraded answer. No new tables/columns.)

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `settings.failure.label` | Simulate failure | Simular falha |
| `settings.failure.none` | Off | Desligado |
| `settings.failure.tool_error` | Tool error | Erro de ferramenta |
| `settings.failure.llm_timeout` | LLM timeout | Timeout do modelo |
| `readout.simulatedError` | ⚠️ simulated failure | ⚠️ falha simulada |
| degraded answer (`llm_timeout`) | ⚠️ The model timed out — no answer this turn. | ⚠️ O modelo expirou — sem resposta neste turno. |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Backend tests run against real OpenAI (`@pytest.mark.openai`) and assert structurally;
the no-failure-unchanged guard is keyless where possible. Frontend pure-store tests with
Vitest.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | omitting `simulate_failure` (or `none`) leaves the run identical (no `error` in any `data`); `overridesFor` omits it when `none` | `backend/tests/test_failure.py` + `frontend/src/lib/experiment.test.ts` |
| AC2 | `tool_error` → an `mcp.call` END carries `{error, simulated}` and the run reaches a terminal state (no 500), answer present/degraded | `backend/tests/test_failure.py` (`@pytest.mark.openai`) |
| AC3 | `llm_timeout` → an LLM stage carries the timeout error and the run ends in a clean degraded state (no hang/500) | `backend/tests/test_failure.py` |
| AC4 | `/api/config` returns `failure_modes` equal to the `SimulateFailure` values; control is per-conversation | `backend/tests/test_config.py` + `experiment.test.ts` |
| AC5 | selector + option + degraded strings exist in en **and** pt | i18n parity test |

## Risks / trade-offs

- **`tool_error` needs a tool call.** It only manifests if the agent actually calls a
  tool that turn; for the demo, pair it with a tool-triggering prompt (e.g. a math
  question → calculator). Documented; not a hang (no tool → nothing to inject).
- **Timeout realism.** We *simulate* a timeout (raise + handle) rather than truly
  blocking — honest because it's labelled `simulated: true` and the failure is real
  enough to teach the degrade path. The run must never hang or 500 (test pins this).
- **Backend overlap with 016.** Both touch `main.py`; schedule in different waves.
- **AC1 is load-bearing.** The whole feature is opt-in; a regression that injects on
  `none` would be a silent behavior change — the AC1 guard runs first (red) to lock it.
