# Spec: Failure treatments (watch the agent *recover*, not just break)

| | |
|---|---|
| **ID** | 051-failure-treatments |
| **Status** | in-progress |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-03 |

## Problem / motivation

017-failure-injection let the learner *inject* a failure — but it only ever shows
the system **breaking**, never **recovering**. Today `llm_timeout` raises once and
jumps straight to a canned answer (`"The model timed out — no answer this turn."`),
so the canvas reads as *unhandled crash*, not *handled failure*. `tool_error`
returns an error observation and the agent abstains — which **is** a real treatment
(graceful degradation), but nothing labels it as one, so the lesson is lost.

The interesting part of production agents is precisely the **error handling**: retry
with backoff, timeouts, circuit breakers, and graceful-degradation fallbacks — the
same resilience patterns the Learn page already names ("retries com backoff, timeouts
e circuit breakers por salto"). This spec turns the failure switch from "watch it
break" into "watch it **try to recover, and degrade gracefully when it can't**" —
the genuinely "didactically devastating" version 017 set out to be.

This stays in the **017 / 006 / 008 family**: a request-only input that changes *how*
a run executes, surfaced through **additive event `data`** — **no new pipeline
`Stage`**.

## Goals

- When `llm_timeout` is injected, the learner watches a **real resilience ladder**:
  the model call is **retried a bounded number of times** with **increasing
  (exponential) backoff** between attempts; when the attempts are exhausted, a
  **circuit-breaker opens** and the run falls back to a clearly-labelled **degraded
  answer** — a terminal, handled state (no hang, no 500).
- When `tool_error` is injected, the agent's reaction is **explicitly labelled** as
  the treatment it already is — **graceful degradation / abstain** — distinct from an
  unhandled error.
- Every step of the treatment (attempt number, backoff wait, circuit state, the named
  fallback) is **inspectable** on the canvas/Inspector, bilingually.
- The resilience machinery is **real control flow** (real bounded loop, real backoff
  waits, real circuit counter) — only the underlying failure is injected (§3).

## Non-goals

- **No new pipeline `Stage`/`Phase`/`TraceEvent` type.** The treatment is carried as
  additive keys on existing END-event `data` (the 017 pattern), so `STAGE_TO_STATION`
  and `STAGE_TO_PHASE` stay total and the protocol mirror is untouched.
- **No change to the happy path.** A no-failure run (`simulate_failure = none`) is
  byte-for-byte unchanged — the resilience ladder is only *exercised and visualized*
  under an injected failure. Wrapping real (non-simulated) calls in the same policy is
  **deferred** (see "Out of scope").
- Not a new failure mode / not a chaos framework: the bounded enum stays
  `none | tool_error | llm_timeout`; `GET /api/config` advertises the same set.
- Not a configurable retry/backoff policy in the UI — the policy constants are fixed
  and didactic, not user-tunable, this round.

## User-facing behavior

- With **`llm_timeout`** set, sending a turn shows the model station being **retried**:
  several attempt spans, each badged as a simulated timeout, with a **visible,
  growing backoff** between them; after the last attempt the canvas shows the
  **circuit-breaker opening** and the chat settling on a **degraded/fallback answer**
  framed as a deliberate treatment ("no reliable answer this turn — degraded
  gracefully"), not a raw error.
- With **`tool_error`** set, the tool failure is shown and the agent's abstention is
  **labelled "graceful degradation"** (the treatment), so the learner reads it as
  handling, not breakage.
- All new prose (badges, the fallback answer, treatment labels, glossary tooltips for
  *retry / backoff / circuit breaker / graceful degradation*) ships in **en + pt**.
- Default (`none`) is unchanged.

## Acceptance criteria

1. **AC1** — With `simulate_failure = none`, the emitted event stream for a turn is
   **unchanged** vs. before this spec (no `attempt`/`backoff`/`circuit`/`treatment`
   keys appear): a no-failure run is byte-for-byte the same.
2. **AC2** — With `llm_timeout`, the model reasoning call emits **more than one**
   attempt span (a bounded `MAX_RETRIES`), each carrying an incrementing `attempt`
   index and `simulated: true` + the timeout `error`; the run **does not 500** and
   reaches a terminal state.
3. **AC3** — The **backoff between attempts is real and increasing** (exponential):
   each retry records a `backoff_ms` strictly greater than the previous attempt's, and
   the attempts are separated in time by at least the recorded backoff.
4. **AC4** — After the retries are exhausted, a **circuit-breaker open** state is
   recorded (`circuit: "open"`) and the run terminates on a **labelled fallback answer**
   (a `treatment` of `"fallback"`/graceful degradation), not an unhandled error and not
   a silent success.
5. **AC5** — With `tool_error`, the agent reaches a terminal state with its reaction
   **labelled as a treatment** (`treatment: "graceful_degradation"` on the relevant
   END `data`), distinct from `simulate_failure = none`; the run does not 500.
6. **AC6** — The treatment metadata (attempt/max, backoff, circuit state, treatment
   name) is **rendered for the user** on the canvas readout and/or the Inspector for
   the affected station, using **bilingual** labels (no raw enum strings shown).
7. **AC7** — Every new user-facing string exists in **both `en` and `pt`** (badges,
   fallback answer, treatment labels, glossary entries).
8. **AC8** — **No new `Stage`/`Phase`/`TraceEvent` type**: `schemas.py` ↔ `events.ts`
   mirror is unchanged except an optional additive TS shape for the new `data` keys;
   `GET /api/config` still advertises `none | tool_error | llm_timeout`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — reuses `llm.prompt` (retry attempts) and
  `mcp.call` / `rag.retrieve` (tool treatment) spans with additive `data` keys.
- Mirror in `frontend/src/types/events.ts`: **additive only** — extend the existing
  `SimulatedError` (017) / prompt `data` shape with optional
  `attempt? / max_retries? / backoff_ms? / circuit? / treatment?`; no `Stage`/`Phase`
  enum change.
- Station it maps to in `stations.ts`: **none new** — the LLM station (`llm.prompt`)
  and the MCP/RAG stations already own these stages.

## Clarified (2026-06-03)

- [x] **Direction** — enrich to show the *treatments* (user chose this over "just
  relabel" and "remove"), per the locked preview: `llm_timeout` → retry + growing
  backoff → circuit opens → fallback; `tool_error` → abstain labelled as graceful
  degradation.
- [x] **No new `Stage`** — additive `data` on existing spans (017 pattern); keeps §6
  exhaustive maps total and the protocol mirror clean.
- [x] **Real machinery, injected failure** (§3) — the retry loop, the backoff waits and
  the circuit counter are real control flow in the agent; only the underlying model
  call is forced to time out.
- [x] **Backoff is real but short/didactic** — real `asyncio.sleep`s with a small base
  so the ladder is observable in timing without making the demo slow (exact constants
  live in `plan.md`); displayed value == slept value (honest).
- [x] **Enum unchanged** — still `none | tool_error | llm_timeout`; no `GET /api/config`
  change, no new selector option.
- [x] **Happy path untouched** — the policy is only exercised under an injected failure
  (AC1); protecting real calls is deferred.

## Out of scope / deferred

- A **transient-recovery** sub-mode where a retry *succeeds* (failure clears on attempt
  N) to contrast "recovered by retry" vs. "exhausted → fallback" — richer, but needs a
  new enum value + config; parked for a follow-up.
- Wrapping **real (non-simulated)** model/tool calls in the same retry/circuit policy
  (a genuine resilience layer, not just a demo) — separate spec.
- User-tunable policy (retry count / backoff base / breaker threshold) in the UI.
- Advanced-rung failure modes (rate-limit, RAG-empty) — still deferred per 017.
