# Tasks: Failure treatments

> Ordered TDD checklist (red → green → refactor). Each implement task is preceded by
> the failing test that drives it. Builds on 017 (`backend/tests/test_failure.py`).
> **No new `Stage`** — only additive `data` + an additive TS shape. Check boxes as you go.

## Tasks

### Pre-flight

- [x] **T0 — verify 017 is green.** `pytest -q backend/tests/test_failure.py`
      (the keyless guard tests at least). This spec extends that file's
      no-failure invariant (AC1).

### Resilience policy — pure, keyless (AC3)

- [x] **T1 — test first** (new `backend/tests/test_failure_treatments.py`):
      `test_backoff_is_exponential_and_increasing` — import `backoff_ms` from
      `app.agent.resilience`; assert `backoff_ms(1) < backoff_ms(2) < backoff_ms(3)`
      and each `> 0`. → **red** (module doesn't exist).
- [x] **T2 — implement**: add `backend/app/agent/resilience.py` with `MAX_RETRIES`,
      `BACKOFF_BASE_MS`, `backoff_ms(attempt)` (exponential), and the constants
      `TREATMENT_FALLBACK`, `TREATMENT_GRACEFUL`, `CIRCUIT_OPEN`. → **green** T1.

### AC1 — no-failure run unchanged (lock the invariant)

- [x] **T3 — test first**: extend `backend/tests/test_failure.py`
      (`test_run_without_failure_has_no_simulated_error_on_any_event`) to also assert
      **no** event `data` carries `attempt` / `backoff_ms` / `circuit` / `treatment`.
      → **red** only after T6 lands keys on the failure path; stays green for `none`.
      (Write the assertion now so the invariant is pinned before touching `graph.py`.)

### AC2 + AC3 + AC4 — llm_timeout retry → backoff → circuit → fallback

- [x] **T4 — test first** (`test_failure_treatments.py`, `@pytest.mark.openai`):
      `test_llm_timeout_retries_with_growing_backoff` — POST `llm_timeout`, batch;
      collect `llm.prompt` END events; assert `len > 1` (== `MAX_RETRIES`), each has
      `simulated is True`, an incrementing `attempt`, and a `backoff_ms` strictly
      greater than the previous. → **red**.
- [x] **T5 — test first**: `test_llm_timeout_opens_circuit_and_falls_back` (`@openai`)
      — assert the `agent.think` END (or final llm.prompt) carries `circuit == "open"`
      and `treatment == "fallback"`; `respond` END fired; `answer` non-empty; **no**
      `llm.generate` event; status 200 (no 500). → **red**.
- [x] **T6 — implement**: in `graph.py` `think_node`, branch on
      `simulate_failure == "llm_timeout"`: real retry loop emitting one `llm.prompt`
      span per attempt (`attempt`/`max_retries`/`backoff_ms`/`simulated`/`error`),
      `await asyncio.sleep(backoff_ms/1000)` between attempts, then set
      `circuit`/`treatment` on the `agent.think` END and return the degraded answer.
      Leave the non-`llm_timeout` branch byte-for-byte. → **green** T4, T5; T3 still
      green for `none`.
- [x] **T6b — test (timing)**: `test_llm_timeout_attempts_separated_by_backoff` —
      assert consecutive `llm.prompt` START timestamps differ by ≥ the recorded
      `backoff_ms` (real waits, §3 / AC3). Keep tolerance loose. → green after T6.

### AC5 — tool_error labelled graceful degradation

- [x] **T7 — test first** (`@openai`): `test_tool_error_is_labelled_graceful_degradation`
      — POST `tool_error` with a tool-triggering prompt; assert a failed `mcp.call`
      (or `rag.retrieve`) END carries `treatment == "graceful_degradation"`, distinct
      from a `none` run (which has no `treatment`); status 200. → **red**.
- [x] **T8 — implement**: in `_run_mcp_tool` + `_run_retrieval_tool`, when
      `fail_tool`, add `treatment = TREATMENT_GRACEFUL` to the END `data`. → **green** T7.

### Protocol mirror (AC8) — additive only

- [x] **T9 — implement**: extend the `SimulatedError` shape in
      `frontend/src/types/events.ts` with optional `attempt?` / `max_retries?` /
      `backoff_ms?` / `circuit?` / `treatment?`; add the docstring note to
      `backend/app/schemas.py` `TraceEvent.data`. No `Stage`/`Phase` change.
- [x] **T10 — test**: `backend/tests/test_failure.py` — assert `/api/config`
      `failure_modes` is still exactly `["none","tool_error","llm_timeout"]` and the
      `Stage` enum membership is unchanged (a simple set assertion). → green (guards AC8).

### i18n (AC7)

- [x] **T11 — test first**: extend `frontend/src/i18n/strings.test.ts` to assert the
      new `readout.retrying`/`readout.circuitOpen`, the new `inspector.*` treatment
      keys, and the new `glossary.*` resilience entries are non-empty in **both**
      `en` and `pt`. → **red**.
- [x] **T12 — implement**: add those keys to `frontend/src/i18n/strings.ts`
      (en + pt, per the plan's i18n table). → **green** T11.

### Frontend rendering (AC6)

- [x] **T13 — test first**: a Vitest unit (`FlowCanvas.test.tsx` or a readout helper
      test) — given `llm.prompt` END events carrying `attempt`/`circuit`, the llm
      readout renders the retry/backoff/circuit text (not the bare `simulatedError`);
      given a `tool_error` mcp END with `treatment`, the mcp readout shows it. → **red**.
- [x] **T14 — implement**: extend `readoutFor` (`FlowCanvas.tsx`) llm + mcp cases and
      `renderDetail` (`InspectorPanel.tsx`) llm + mcp cases to read the new fields and
      render them via the new i18n strings. → **green** T13.
- [x] **T15 — replay sanity (050)**: confirm (or add) a derive/replay test that the
      extra `llm.prompt` spans animate under a stepped cursor like any other event —
      no special-casing.

### Refactor + gates

- [x] **T16 — refactor**: tidy the retry loop (extract a helper in `graph.py` if it
      reads cleanly), keep all tests green; reword `DEGRADED_TIMEOUT_ANSWER` to frame
      the fallback as a deliberate treatment.
- [x] **T17 — move spec status** `clarified → planned → in-progress → done` as you go.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (table in `plan.md`)
- [x] `ruff check .` + `ruff format .` clean
- [x] `pytest -q` green (with `OPENAI_API_KEY`; keyless guards green without)
- [x] `npm run build` passes (`tsc --noEmit` + build) and `npm test` (Vitest) green
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); **no new `Stage`**, every
      Stage still mapped to a station; `STAGE_TO_PHASE` untouched
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
