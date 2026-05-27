# Tasks: Failure injection (watch the agent degrade)

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Clarify resolved** — tool_error + llm_timeout · error-observation → degrade/abstain ·
> `error` key on END `data` (no new Stage) · persistent until toggled (`spec.md`,
> 2026-05-27). Follows the 006/008 request-only pattern. Touches `main.py` — schedule
> apart from 016.

## Phase 1 — No-failure invariant (AC1) — lock it FIRST

- [x] **T1 — test first**: `backend/tests/test_failure.py` — a run with `simulate_failure`
  omitted (and `= none`) produces **no** `error`/`simulated` key on any event `data`
  (the run is unchanged). Frontend: `experiment.test.ts` — `overridesFor` omits
  `simulate_failure` when `none`.
- [x] **T2 — implement**: `SimulateFailure` enum + `ChatRequest.simulate_failure` field
  (`schemas.py`); `AgentState.simulate_failure` (`state.py`); `run_agent(...,
  simulate_failure="none")` threads to state but injects nothing yet; `main.py` passes
  `req.simulate_failure` + adds it to `request_body`. Frontend: `ConvExperiment.
  simulateFailure` default `"none"` + `overridesFor` omit-when-none.

## Phase 2 — tool_error (AC2)

- [x] **T3 — test first**: `tool_error` (with a tool-triggering prompt) → an `mcp.call`
  END `data` carries `{ error, simulated: true }`, the run reaches a terminal state
  (no 500), and an answer (degraded/abstained) is produced (`@pytest.mark.openai`).
- [x] **T4 — implement**: in `tools_node`, when `simulate_failure == "tool_error"`,
  short-circuit `registry.call` to a simulated error observation; record the error on
  the stage `data`; feed the error back to the model so it reasons/degrades.

## Phase 3 — llm_timeout (AC3)

- [x] **T5 — test first**: `llm_timeout` → an LLM stage END `data` carries the timeout
  error and the run ends in a clean degraded state (no hang, no unhandled 500); a
  degraded answer is set.
- [x] **T6 — implement**: in `think_node`, inject + catch the simulated `TimeoutError`;
  record the error on `data`, set the degraded answer, route to `respond`.
  *Deviation:* `_should_continue` returns `"respond"` for `llm_timeout` (a new
  `think → respond` conditional edge), so `generate_node` is never reached — the
  planned `generate_node` guard was unnecessary (no real call can happen after the
  short-circuit).

## Phase 4 — config advertise + frontend control (AC4)

- [x] **T7 — test first**: `/api/config.failure_modes` equals the `SimulateFailure`
  values. `experiment.test.ts` — the control is per-conversation and persists until set
  back to `none`. *Deviation:* the config test lives in `test_failure.py` (with the
  feature's other tests), not a new `test_config.py` — there is no such file and
  `/api/config` is already covered in `test_api.py`/`test_scenario.py`.
- [x] **T8 — implement**: add `failure_modes` to `/api/config`; surface it in the
  frontend config hook (`AppConfig.failure_modes`); add the "Simulate failure" selector
  to `SettingsPanel.tsx` (options from `failure_modes`); read `data.simulated` on the
  MCP/LLM readout (`FlowCanvas`) + Inspector blocks (badged). Add `simulate_failure?` to
  the TS request mirror + optional `SimulatedError` shape.

## Phase 5 — i18n (AC5, §4)

- [x] **T9 — test first**: parity — selector/option/degraded strings exist in en **and**
  pt.
- [x] **T10 — implement**: add the strings to `frontend/src/i18n/strings.ts` (en + pt) —
  `settings.experiment.failure` (label/hint/modes), `readout.simulatedError` (canvas
  badge), `inspector.simulatedError` (drill-in badge).

## Phase 6 — Verify & refactor

- [x] **T11 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (with a key) ·
  `npm test` · `npm run build` — all green. No new `Stage`/`Phase`; `data` stays open.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC5)
- [x] Omitting `simulate_failure` reproduces today's run byte-for-byte (AC1 guard green)
- [x] No new `Stage`/`Phase`/`TraceEvent` type; only `ChatRequest` gains the field
- [x] `/api/config` advertises `failure_modes`; control scoped per conversation
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
