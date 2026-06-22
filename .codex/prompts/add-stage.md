---
description: End-to-end checklist for adding or changing a pipeline Stage (keeps the ~7 load-bearing places in sync).
argument-hint: <stage name / purpose>
---

You are adding or changing a pipeline `Stage` in **AgentSimulator**: **$ARGUMENTS**

A new `Stage` is a **feature → spec required** (constitution §1, §6; gray-zone rule in `AGENTS.md`). Run `/new-spec` first if there's no spec. Implement TDD (failing test first), and walk this checklist — order matters, and the protocol mirror must land in the **same commit**.

## Load-bearing places (none optional)

1. **`backend/app/schemas.py`** — add the value to the `Stage` enum (and `Phase`/`TraceEvent` if the shape changes).
2. **`frontend/src/types/events.ts`** — mirror it by hand, **same commit** (§1). This is the TS half of the contract.
3. **Emit it** in the relevant node: `async with emitter.stage(Stage.X, label) as rec:` (auto START/END + timing; set `rec.data`/`rec.metrics`), or `emitter.emit(...)` for one-shot/PROGRESS. The emitter comes from `config["configurable"]` via `_deps()` in `agent/graph.py`, never a global.
4. **`frontend/src/lib/stations.ts`** — add the `Stage` to **exactly one** station's `stages` array (derives `STAGE_TO_STATION`, which `deriveView` relies on). An unmapped stage silently breaks the projection.
5. **`frontend/src/lib/phases.ts`** — assign the `Stage` a `TimelinePhase` in `STAGE_TO_PHASE` (`Record<Stage, TimelinePhase>`, so `tsc` fails if missing — but pick the right phase). `phases.test.ts` pins parity with `STAGE_TO_STATION`.
6. **`frontend/src/components/FlowCanvas.tsx`** — `readoutFor` is exhaustive over `StationId`; add/extend the station's `case`.
7. **`frontend/src/components/InspectorPanel.tsx`** — `renderDetail` is exhaustive over `StationId`; add/extend the station's `case`.

## If it introduces a NEW station/tier/hop

- Fill station identity in `stations.ts`: `title`/`tag`/`generic` role + the **full cloud map** `clouds: { azure, aws, gcp }` (§5 — all three).
- Add the network hop(s) with `zone` (public/private) + security `controls`.
- A new station tag/jargon term needs a **glossary** entry in `frontend/src/i18n/strings.ts`.

## Bilingual (§4) — always

Every new label/readout/blurb/tag/error string ships `{ en, pt }`. No single-language strings, ever.

## TDD + gates

- Write the failing test first; assert **structurally** (stage fired, data present) to tolerate model variability.
- Relevant FE pins: `phases.test.ts`, `stations.test.ts`, `FlowCanvas.readout.test.ts`.
- Finish by running `/verify-gates`. `tsc` catches (5) but **not** (4), (6), (7) — don't rely on it.

Reference: `AGENTS.md` "Architecture — the load-bearing ideas" describes every one of these maps; trust it over guessing.
