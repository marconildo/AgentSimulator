# Plan: Failure treatments

> The HOW for 051. Builds on 017's injection points. **No new `Stage`** — every
> treatment is additive `data` on the existing `llm.prompt` / `mcp.call` /
> `rag.retrieve` spans, so `STAGE_TO_STATION` / `STAGE_TO_PHASE` stay total and the
> `schemas.py` ↔ `events.ts` mirror is unchanged (additive TS shape only). Respects
> §3 (real machinery, injected failure only), §1 (protocol), §4 (bilingual).

## Approach

Two changes, both scoped to the agent and surfaced through additive event data:

1. **`llm_timeout` → a real retry/backoff/circuit-breaker ladder.** Today
   `think_node` raises a `TimeoutError` once and jumps to the canned answer. We
   replace that single shot with a **real bounded loop**: up to `MAX_RETRIES`
   attempts, each one its own `llm.prompt` span that times out (carrying
   `attempt`, `max_retries`, `simulated`, `error`), with a **real `asyncio.sleep`**
   of an **exponential `backoff_ms`** between attempts (the slept value == the
   recorded value — honest). When the attempts are exhausted, the `agent.think` END
   records `circuit: "open"` + `treatment: "fallback"` and the run degrades to the
   fallback answer (route straight to `respond`, same as 017 — no real generation).
   The retry policy is a tiny pure module so the backoff curve is unit-testable in
   isolation.

   *Why multiple `llm.prompt` spans rather than one span with a count?* Because the
   Execution-Traces tree (038) and the canvas already key off spans — N attempt
   spans makes the retries **visible for free** in the span tree, and `deriveView`'s
   "last `llm.prompt` end" still resolves to the final (circuit-open) attempt for the
   readout. No projection change needed.

2. **`tool_error` → label the existing abstain as a treatment.** The agent already
   reasons over the injected error observation and degrades/abstains — that *is*
   graceful degradation. We make it legible by adding `treatment:
   "graceful_degradation"` to the failed `mcp.call` / `rag.retrieve` END `data`
   (next to the existing `error` / `simulated` keys). No control-flow change — the
   agent's real reaction is unchanged; we only name it.

**Alternatives considered + rejected.**
- *One `llm.prompt` span with `attempts: N`.* Fewer events, but the retries become
  invisible in the span tree and the "watch it retry" animation is lost — defeats the
  spec's whole point.
- *Real `asyncio.sleep` with production-scale backoff (seconds → tens of seconds).*
  Honest but makes the demo painful. We use a small base (`BACKOFF_BASE_MS = 200`,
  ×2 per attempt ⇒ 200/400/800ms) — real waits, observable in timing, total < 1.5s.
- *Faked backoff (display a number, don't sleep).* Rejected — violates §3; AC3
  asserts attempts are actually separated in time by ≥ the recorded backoff.
- *Wrapping real (non-simulated) calls in the policy.* Out of scope (spec); would
  change the happy path and AC1.

## Affected files

**Backend**
- `backend/app/agent/resilience.py` — **new**, tiny pure module: `MAX_RETRIES`,
  `BACKOFF_BASE_MS`, `backoff_ms(attempt) -> int` (exponential), and treatment-name
  constants (`TREATMENT_FALLBACK = "fallback"`, `TREATMENT_GRACEFUL =
  "graceful_degradation"`, `CIRCUIT_OPEN = "open"`). Pure + sync ⇒ unit-testable
  without a key.
- `backend/app/agent/graph.py` —
  - `think_node`: when `simulate_failure == "llm_timeout"`, run the retry loop
    (emit one `llm.prompt` span per attempt with `attempt`/`max_retries`/
    `backoff_ms`/`simulated`/`error`; `await asyncio.sleep(backoff_ms/1000)`
    between attempts), then set `circuit`/`treatment` on the `agent.think` END and
    return the degraded answer. The **non-`llm_timeout` branch is unchanged**
    (single span, byte-for-byte) to hold AC1.
  - `_run_mcp_tool` / `_run_retrieval_tool`: when `fail_tool`, add
    `treatment = TREATMENT_GRACEFUL` to the END `data` (next to `error`/`simulated`).
  - Keep `DEGRADED_TIMEOUT_ANSWER`; reword slightly to read as a deliberate
    treatment ("…degraded gracefully — no reliable answer this turn.").
- `backend/app/schemas.py` — **docstring only**: extend the `TraceEvent.data`
  note to mention the additive treatment keys (`attempt`/`max_retries`/`backoff_ms`/
  `circuit`/`treatment`). No type/enum change.

**Frontend**
- `frontend/src/types/events.ts` — extend the `SimulatedError` shape (017) with
  optional `attempt?`, `max_retries?`, `backoff_ms?`, `circuit?`, `treatment?`.
  Additive, no `Stage`/`Phase` change.
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor` `llm` case: when the last
  `llm.prompt` END carries `attempt`, show a retry/backoff readout
  (`ro.retrying(attempt, max)` / `ro.circuitOpen`) instead of the bare
  `simulatedError`; `mcp` case: append the treatment tag when present.
- `frontend/src/components/InspectorPanel.tsx` — `llm` case: list the attempts with
  `attempt/max`, `backoff_ms`, and the `circuit`/`treatment` outcome; `mcp` case:
  show the `treatment` label under the simulated-tool-error badge.
- `frontend/src/i18n/strings.ts` — new `readout` keys (`retrying`, `circuitOpen`),
  new `inspector` keys (`attempt`, `backoff`, `circuit`, `treatment`,
  `treatmentFallback`, `treatmentGraceful`), and new `glossary` entries (retry /
  backoff / circuit breaker / graceful degradation) — all en + pt.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — **no type change** (docstring note only); `data` is an
  open map, the new keys are additive (017 precedent).
- `frontend/src/types/events.ts` — **additive** optional fields on the existing
  `SimulatedError` shape; no `Stage`/`Phase` enum change.
- Emitted in: `backend/app/agent/graph.py` (`think_node` retry loop; `_run_mcp_tool`
  / `_run_retrieval_tool` treatment label).
- Mapped to station in `frontend/src/lib/stations.ts`: **n/a** — reuses `llm.prompt`
  (LLM station) and `mcp.call`/`rag.retrieve` (MCP/RAG stations), already mapped.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) case added: **n/a new** —
  the `llm` and `mcp` cases already exist; we extend their bodies.

## Data model changes

None. No Chroma change, no SQLite schema change, no migration. Trace events persist
via 048 unchanged (the new keys ride along in the denormalized `data` JSON).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `readout.retrying` (fn `(n,max)`) | `retry {n}/{max}` | `retentativa {n}/{max}` |
| `readout.circuitOpen` | `circuit open → fallback` | `circuito aberto → fallback` |
| `inspector.attempt` | `Attempt` | `Tentativa` |
| `inspector.backoff` | `Backoff` | `Espera (backoff)` |
| `inspector.circuit` | `Circuit breaker` | `Disjuntor (circuit breaker)` |
| `inspector.treatment` | `Treatment` | `Tratamento` |
| `inspector.treatmentFallback` | `Fallback — graceful degradation` | `Fallback — degradação graciosa` |
| `inspector.treatmentGraceful` | `Graceful degradation (abstained)` | `Degradação graciosa (abstenção)` |
| `glossary.retry` | `Retry: re-attempt a failed call a bounded number of times.` | `Retentativa: refaz uma chamada que falhou um número limitado de vezes.` |
| `glossary.backoff` | `Backoff: wait longer between each retry (here, exponential) to relieve a struggling dependency.` | `Backoff: espera crescente entre tentativas (aqui, exponencial) para aliviar uma dependência em apuros.` |
| `glossary.circuitBreaker` | `Circuit breaker: after repeated failures, stop calling and fail fast instead of hanging.` | `Disjuntor: após falhas repetidas, para de chamar e falha rápido em vez de travar.` |
| `glossary.gracefulDegradation` | `Graceful degradation: return a reduced, honest result (abstain / fallback) instead of crashing.` | `Degradação graciosa: devolve um resultado reduzido e honesto (abstenção / fallback) em vez de quebrar.` |

> Note: the **fallback answer string** itself (`DEGRADED_TIMEOUT_ANSWER`) stays a
> backend-produced content string (parity with 017, which shipped it English-only and
> passed) — the **bilingual coverage is on the UI labels/badges/glossary** above. The
> treatment is *named* bilingually in the canvas/inspector regardless of the answer
> language.

## Cloud map (constitution §5)

n/a — no new tier/station/boundary. Reuses existing LLM + MCP/RAG stations.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `none` run carries no `attempt`/`backoff`/`circuit`/`treatment` keys (extends the existing no-failure invariant test) | `backend/tests/test_failure.py` (`@openai`) |
| AC2 | `llm_timeout` emits >1 `llm.prompt` END, each `simulated` + incrementing `attempt`; no 500; terminal state | `backend/tests/test_failure_treatments.py` (`@openai`) |
| AC3 | `backoff_ms(attempt)` strictly increasing (pure unit, keyless) **and** attempts separated in time ≥ recorded backoff (run-level) | `backend/tests/test_failure_treatments.py` |
| AC4 | exhausted retries record `circuit: "open"` + `treatment: "fallback"`; terminal degraded answer; no real `llm.generate` | `backend/tests/test_failure_treatments.py` (`@openai`) |
| AC5 | `tool_error` END carries `treatment: "graceful_degradation"`, distinct from `none`; no 500 | `backend/tests/test_failure_treatments.py` (`@openai`) |
| AC6 | `readoutFor` llm-case renders retry/backoff/circuit from event data; mcp-case renders treatment | `frontend/src/components/FlowCanvas.test.tsx` (or a `derive`/readout unit) |
| AC7 | new `readout`/`inspector`/`glossary` keys exist in **both** `en` and `pt` | `frontend/src/i18n/strings.test.ts` |
| AC8 | `Stage` enum membership unchanged; `/api/config` `failure_modes` unchanged (`none/tool_error/llm_timeout`) | `backend/tests/test_failure.py` + `backend/tests/test_schemas.py` |

Keyless unit tests (backoff curve, strings parity, config enum) run without a key;
the `@openai` run-level tests assert **structurally** to tolerate model variability.

## Risks / trade-offs

- **Latency.** Real backoff adds ~1.4s (200+400+800ms) to a simulated `llm_timeout`
  run. Acceptable — it's the point (you *see* the waits), and only on the opt-in
  failure path. Constants live in `resilience.py` if we want to tune.
- **Determinism.** The injected timeout is deterministic; `MAX_RETRIES`/backoff are
  fixed constants, so the span count + curve are stable for tests (AC2/AC3).
- **Single-instance (§7).** Unchanged — the circuit state is per-run, not shared; no
  cross-replica breaker. A real distributed breaker is out of scope.
- **Replay parity (050).** The extra `llm.prompt` spans flow through the same
  `deriveView` cursor path, so step/replay animate the retries identically — no
  special-casing. Worth a sanity check in the Vitest derive suite.
- **`tsc` exhaustiveness.** No new `Stage`/`StationId`, so the exhaustive switches are
  untouched — lowest-risk integration surface.
