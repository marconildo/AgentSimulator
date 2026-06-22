---
description: Read-only audit of the event-protocol contract and its exhaustive Stage maps.
---

Audit the current change in **AgentSimulator** for the event-protocol contract (constitution §1) and the Stage maps (§6). **Read-only — do not edit; produce a precise findings report.**

## Verify

1. **Protocol mirror (§1).** Enumerate `Stage` (and `Phase`) in `backend/app/schemas.py` and the mirror in `frontend/src/types/events.ts`. They must be **identical sets** — flag any value in one and not the other. If `TraceEvent` shape changed on one side, confirm the other matches. Use `git diff` to confirm both moved together when one did.
2. **Stage → station (§6).** Every `Stage` appears in **exactly one** station's `stages` array in `frontend/src/lib/stations.ts` (derives `STAGE_TO_STATION`). Flag any unmapped stage (silently breaks `deriveView`) or one mapped twice.
3. **Stage → phase.** Every `Stage` has an entry in `STAGE_TO_PHASE` in `frontend/src/lib/phases.ts` (`Record<Stage, TimelinePhase>`). Confirm parity with `STAGE_TO_STATION` (pinned by `phases.test.ts`).
4. **Exhaustive switches.** `readoutFor` (`FlowCanvas.tsx`) and `renderDetail` (`InspectorPanel.tsx`) are exhaustive over `StationId`; a new station id needs a `case` in both.
5. **Emission.** A new `Stage` is actually emitted somewhere in `backend/app/` (via `emitter.stage`/`emitter.emit`). Flag declared-but-never-emitted.

Prefer `grep`/`git diff` to pinpoint; run `npm test`/`npm run build` from `frontend/` if you need to confirm a parity test's state.

**Output:** ✅ per invariant that holds; ❌ with `file:line` + the exact fix for each that doesn't. End with a one-line verdict (protocol in sync / N issues). Do not modify files.
