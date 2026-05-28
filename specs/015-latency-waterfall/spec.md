# Spec: Per-phase latency waterfall

| | |
|---|---|
| **ID** | 015-latency-waterfall |
| **Status** | superseded by 038-execution-traces |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

The visualizer shows a total latency per station, but there is **no decomposition of
where the time went** across the request. A Chrome-DevTools-style waterfall — Request
8ms, Retrieve 47ms, Reason 824ms (LLM), Tools 291ms, Reason 1056ms (LLM), Generate
718ms … — is *the* visualization that teaches the cost structure of an agent, and it's
exactly how people who operate LLMs in production think. Every stage is **already
timed** (`latency_ms` on each END event), so this is a pure projection of data we have.

## Goals

- Show a **per-phase (and per-ReAct-round) timing breakdown** of a run as a waterfall,
  derived entirely from existing event durations.
- Make the **two LLM reasoning rounds and the tool round visibly dominate** the total,
  so the lesson ("the model calls are where the time is") is self-evident.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent`; no backend change; latency is not re-measured.
- Not a flame graph or a distributed trace — a simple ordered bar list is the target.

## User-facing behavior

- After a run, a **timing breakdown** lists each phase in run order with its duration
  and a proportional bar, plus the **total**. Repeated phases (ReAct loops) appear as
  separate bars (`Reason` twice).
- Sub-millisecond bars read `<1 ms` (reuse B4's `formatLatency`), never `0 ms`.
- All labels/headers are bilingual (en + pt).

## Acceptance criteria

1. **AC1** — A pure function maps an event log to an **ordered list** of
   `{ label, durationMs, offsetMs }` segments in run order, one per timed phase
   occurrence.
2. **AC2** — A phase that occurs N times (ReAct rounds) yields **N separate segments**,
   preserving order (`Reason ×2` → two segments).
3. **AC3** — The reported **total** equals the run's wall-clock span (last END − first
   START) within rounding, and the segment durations are attributed from the events'
   `latency_ms` (untimed gaps handled honestly per Open questions).
4. **AC4** — Durations format via `formatLatency` (`<1 ms` floor; whole ms otherwise).
5. **AC5** — The breakdown's labels and header exist in **both en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a** (groups by `STAGE_TO_PHASE`)

## Clarified (2026-05-27)

- [x] **Placement** → a **new "Timing" panel in the Timeline area**, beside the phase
  rail (the temporal home; most discoverable).
- [x] **Granularity** → **per phase** (the 9 `TimelinePhase` buckets); repeated phases
  (ReAct rounds) render as **separate occurrence segments** (`Reason ×2` → two bars).
- [x] **Untimed gaps** → **reconcile to wall-clock.** Total = the run's wall-clock span
  (from event `ts`); the difference between that and the sum of attributed phase
  durations is shown as a single **"overhead/transit"** bar. No faked attribution; the
  wrapping `backend` envelope is **not** itself a bar (it would double-count the total).

## Out of scope / deferred

- Comparing waterfalls across turns (overlaps 020-turn-diff).
- Live (mid-stream) waterfall animation; this renders on a settled trace first.
