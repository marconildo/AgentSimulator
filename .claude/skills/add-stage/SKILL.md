---
name: add-stage
description: End-to-end checklist for adding or changing a pipeline Stage. Use whenever a change introduces a new Stage/Phase or a new TraceEvent shape. Adding a Stage touches ~7 load-bearing places across backend and frontend, several of which tsc does NOT catch — this skill keeps them in sync so the pure projection never breaks.
---

Adding a `Stage` is a **feature → spec required** (constitution §1, §6; gray-zone rule in `CLAUDE.md`). Run the `new-spec` skill first. Then implement TDD (failing test first) and walk this checklist — the order matters and the protocol mirror must land in the **same commit**.

## The load-bearing places (none optional)

1. **`backend/app/schemas.py`** — add the value to the `Stage` enum (and `Phase`/`TraceEvent` if the shape changes).
2. **`frontend/src/types/events.ts`** — mirror it by hand, **same commit** (§1). This file is the TS half of the contract.
3. **Emit it** in the relevant node. Use `async with emitter.stage(Stage.X, label) as rec:` (auto START/END + timing; set `rec.data` / `rec.metrics`), or `emitter.emit(...)` for one-shot/PROGRESS. The emitter is threaded via `config["configurable"]`, never a global (see `_deps()` in `agent/graph.py`).
4. **`frontend/src/lib/stations.ts`** — add the `Stage` to **exactly one** station's `stages` array. This derives `STAGE_TO_STATION`, which `deriveView` relies on. An unmapped stage silently breaks the projection.
5. **`frontend/src/lib/phases.ts`** — assign the new `Stage` a `TimelinePhase` in `STAGE_TO_PHASE`. It is a `Record<Stage, TimelinePhase>`, so `tsc` **fails** if you forget — but you must pick the right phase. `phases.test.ts` also pins parity with `STAGE_TO_STATION`.
6. **`frontend/src/components/FlowCanvas.tsx`** — `readoutFor` switch is exhaustive over `StationId`. Add/extend the `case` for the station that renders this stage's readout.
7. **`frontend/src/components/InspectorPanel.tsx`** — `renderDetail` switch is exhaustive over `StationId`. Add/extend the `case` for the inspector detail.

## If the stage introduces a NEW station/tier/hop

- Fill the station identity in `stations.ts`: `title`/`tag`/`generic` role **and the full cloud map** `clouds: { azure, aws, gcp }` (§5 — all three).
- Add the network hop(s) with `zone` (public/private) + security `controls`.
- A new station tag/jargon term needs a **glossary** entry in `frontend/src/i18n/strings.ts` (canvas tooltips read from `glossary`).

## Bilingual (§4) — always

Every new label, readout, blurb, tag, error string ships `{ en, pt }`. No English-only (or pt-only) strings. Ever.

## TDD + gates

- Write the failing test first (structural assertions: stage fired, data present — tolerate model variability).
- Relevant frontend pins: `phases.test.ts` (AC1 parity), `stations.test.ts`, `FlowCanvas.readout.test.ts`.
- Finish by running the **`verify-gates`** skill — `tsc` will catch (5) but not (4), (6), (7).

Reference: `CLAUDE.md` "Architecture — the load-bearing ideas" describes every one of these maps; trust it over guessing.
