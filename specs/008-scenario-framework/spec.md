# Spec: Scenario framework (maturity ladder)

| | |
|---|---|
| **ID** | 008-scenario-framework |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Turn the single fixed topology into a **maturity ladder** the learner can climb:
> **Simple** (today — ReAct + vector RAG + MCP, single-turn, in-request),
> **Intermediate** (RAG quality + honest cost: reranker, hybrid search, real
> token/cost accounting), and **Advanced** ("how agents live in production":
> LLM gateway, guardrails in/out, semantic cache, eval runner, observability).
> This spec builds **only the framework** — the scenario seam end-to-end, with
> **Simple fully working (and byte-for-byte equivalent to today)** and the
> Intermediate/Advanced nodes declared as a **preview topology** marked *coming
> soon*. Each later spec (009+) lights up one scenario's real nodes
> (real-mínimo, never mocked — §3).

## Problem / motivation

The app sells itself as a mirror of "how a real system works", but it shows a
single, fixed topology that stops at the **2023 agent** (ReAct + naïve RAG +
MCP). The biggest gap a senior review surfaced is the **AI-Ops eixo** — evals,
observability, guardrails, gateway, caching — that separates a teaching demo
from a production pipeline. Bolting all of that onto one diagram would make the
default view unreadable and bury the simple story that newcomers need first.

A **maturity ladder** solves both: keep the simple, legible default, and let the
learner *climb* to see what each production concern adds and why. It also
delivers, for free, the assessment's top didactic ask — **"com vs sem"** the
extra machinery, side by side — and gives every future AI-Ops feature an honest
home (a scenario) instead of cluttering the base diagram. This spec is the
**foundation**: the scenario concept threaded request → backend → projection,
without yet building the real nodes that fill the upper rungs.

## Goals

- **A first-class `Scenario`** (`simple` | `intermediate` | `advanced`) that is a
  **request-only input** (like the 006 experiment overrides), threaded
  request → `AgentState` → projection, defaulting to `simple`.
- **Simple == today** — with no scenario sent (or `simple`), the run and the
  rendered diagram are structurally identical to the current app (regression
  guard).
- **Scenario-scoped visual model** — `stations.ts` becomes the single source of
  truth for *which* tiers/stations/hops belong to *which* scenario(s); the layout
  and the pure projection (`deriveView`) render only the active scenario's set.
- **Preview topology for the upper rungs** — Intermediate/Advanced render their
  extra stations as an explicit, visually-distinct **"coming soon"** preview (the
  planned architecture is itself a teaching artifact), **without pretending any
  node executes** — no fake data, no `TraceEvent` for an unimplemented stage
  (§3 everything-is-real is about *execution*, and a clearly-labelled non-running
  node honours it).
- **A scenario switcher** in the UI (alongside the existing language/cloud/⚙️
  controls), prefilled from the backend so nothing is hardcoded client-side.
- **Exhaustiveness preserved** — the `Stage` enum and the total maps over it
  (`STAGE_TO_STATION`, `STAGE_TO_PHASE`) stay intact; scenario governs
  *visibility/activation*, never the enum.
- All new prose **bilingual** (en + pt) — §4; new tiers/stations carry the
  `clouds` map filled for azure/aws/gcp — §5.

## Non-goals

- **Building the real Intermediate nodes** — reranker, hybrid search, real
  token/cost accounting belong to their own specs (009+). This spec only reserves
  their place in the ladder.
- **Building the real Advanced nodes** — LLM gateway, guardrails, semantic cache,
  eval runner, observability sink are each a later spec.
- **No new executing `Stage`/`Phase`/`TraceEvent`** here — `scenario` is a request
  input, not a pipeline station. (Coming-soon stations reserve identity in
  `stations.ts`; the `Stage` that activates them ships with their own spec.)
- **No model/provider switching, no mock/keyless mode** — both contradict the
  constitution (single provider OpenAI, everything real); explicitly rejected.
- **No queue/worker/durable rearchitecture** — contradicts single-instance (§8);
  the Advanced *diagram* may depict it as a concept, but the backend stays
  single-instance unless the constitution is amended.
- **No persistence** of the selected scenario across reload or users beyond
  in-memory client state.

## User-facing behavior

A **scenario switcher** is a **global app mode** (Q2), sitting with the other
top-level controls (language, cloud, ⚙️) and mirroring `useCloud`'s store shape.
It offers three rungs with bilingual name + one-line blurb:

- **Simple** — the current app. Fully live: send a message, watch the real
  pipeline. Default.
- **Intermediate** — switches the **diagram** to show the RAG-quality topology
  (reranker + hybrid retrieval stations, a token/cost readout) rendered as
  **"coming soon"** preview tiles. **Sending is disabled** here (Q1) with an "em
  breve / coming soon" note until those nodes ship.
- **Advanced** — switches the diagram to the production topology (gateway,
  guardrails in/out, semantic cache, eval runner, observability sink) as
  **"coming soon"** preview tiles. **Sending is disabled** here (Q1) too.

The preview tiles are visually distinct (e.g. dashed/dimmed) and labelled so it
is unmistakable they don't run yet — they teach the *target architecture*. The
existing Simple stations keep their real behavior. Switching scenarios reflows
the canvas via the existing layout engine. *(All new prose ships en + pt — §4.)*

## Acceptance criteria

> Numbered and testable. Backend ACs run against **OpenAI** (per `003-openai-only`)
> and assert **structurally**. Frontend ACs are Vitest projection/derive tests.

1. **AC1 — request seam + default.** `ChatRequest` accepts an optional
   `scenario` ∈ {`simple`,`intermediate`,`advanced`}; omitting it (or sending
   `simple`) yields a run structurally identical to today (same stages fired,
   same stations active) — a backward-compat regression guard.
2. **AC2 — config-driven, no hardcoding.** `GET /api/config` exposes a
   `scenarios` array: each item has `id`, bilingual `name`/`blurb`, and an
   `available` vs `coming_soon` flag, so the UI renders the switcher without
   hardcoding scenario identities.
3. **AC3 — Simple projection == today.** With scenario `simple`, the visible
   station/hop set produced by the layout + `deriveView` equals the current set
   (client/backend/agent/database/rag/mcp/llm and today's hops) — a pinned
   snapshot.
4. **AC4 — preview without execution.** With scenario `intermediate`/`advanced`,
   the diagram shows that scenario's extra stations flagged `comingSoon` (visually
   distinct), **sending is disabled** with a bilingual "coming soon" note, and
   **no `TraceEvent` is emitted for any not-yet-implemented stage** — there is no
   fake/mock data on a preview node (§3 preserved).
5. **AC5 — scenario scope (global).** The active scenario is a **global app mode**
   (Q2), mirroring `useCloud`: changing it updates the whole app, it is **not**
   per-conversation, and it resets to `simple` on reload. (Because send is gated to
   `simple`, the `scenario` request field is in practice always `simple` until a
   later spec unlocks a rung — but the field + validation exist now per AC1.)
6. **AC6 — bilingual + cloud map.** Every scenario name/blurb and every new
   tier/station label exists en **and** pt; any new tier/station fills
   `clouds.{azure,aws,gcp}` (§4, §5).
7. **AC7 — exhaustiveness intact.** The `Stage` enum is unchanged; a test asserts
   `STAGE_TO_STATION` and `STAGE_TO_PHASE` remain **total** over `Stage` and that
   scenario scoping never removes a `Stage` from those maps (it only filters which
   stations/hops are *visible/active*).

## Protocol / stage impact

§1 & §6.

- New/changed **executing** `Stage`(s): **none**. `scenario` is a **request-only**
  input (mirrors 006), threaded `ChatRequest` → `run_agent` → `AgentState`. It is
  **not** a `TraceEvent` field, so **no `events.ts` mirror is required** — but the
  request schema and `/api/config` shape are part of the API contract (detailed in
  `plan.md`).
- `/api/config` gains a `scenarios` array (read-only; not part of the *event*
  protocol).
- **Station model change:** `stations.ts` gains a per-tier/station/hop
  `scenarios` membership and a `comingSoon` flag. Simple's membership reproduces
  today's set. Coming-soon stations reserve **identity/content only**; the
  `Stage` that lights each up (and its station mapping + the `readoutFor` /
  `renderDetail` / `STAGE_TO_PHASE` cases) ships with that node's own spec.
- Station mapping for live stages: **unchanged**.

## Clarifications (resolved 2026-05-26)

- [x] **Q1 — Locked-rung UX → send disabled (view-only preview).** When
  Intermediate/Advanced are selected (before their nodes exist), **sending is
  disabled** with a bilingual "coming soon" note; the diagram is a view-only
  preview of the target topology. This is the most honest reading of
  §everything-is-real: a rung you can't run can't possibly fake a run. (Chosen
  over "fall back to the simple pipeline", which risked an "Advanced runs the same
  as Simple" confusion.)
- [x] **Q2 — Scenario scope → global app mode.** The scenario is a **global mode**
  like `useCloud`/language (one selection for the whole app), **not**
  per-conversation. Simpler mental model; the store mirrors `useCloud`.
- [x] **Q3 — Declare upper-rung stations now (coming soon).** The
  Intermediate/Advanced stations enter `stations.ts` **now** as scenario-scoped
  data with `comingSoon: true`, so the maturity ladder is visible immediately;
  each later spec (009+) just flips the flag off and wires the real `Stage`
  (+ its `readoutFor`/`renderDetail`/`STAGE_TO_PHASE` cases).

## Out of scope / deferred

- A side-by-side **compare** view (run the same prompt across two scenarios and
  diff answers/citations/cost) — a strong later spec; the assessment's §8.1.
- A standalone **"sem RAG / tools-only"** variant — folded into the ladder later
  or left as a 006-style experiment, not a 4th scenario.
- The real nodes themselves (009 reranker, 010 hybrid search, 011 token+cost,
  012 gateway, 013 guardrails, 014 semantic cache, 015 eval runner, 016
  observability — numbering indicative, not committed).
