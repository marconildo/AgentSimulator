# Project Constitution — AgentSimulator

> The non-negotiable principles every spec, plan, and change must respect.
> Written once, amended deliberately (see *Amendment process*). When a spec or a
> code change conflicts with a principle here, the constitution wins — or the
> principle is amended first, on purpose.

**Project:** an educational visualizer of an agentic AI request lifecycle. A real
LangGraph agent (RAG → MCP tools → LLM) emits trace events that the frontend
animates across a graph of "stations". Runs fully offline in demo mode.

---

## Core principles

### 1. The event protocol is the contract
`backend/app/schemas.py` (`Stage`, `Phase`, `TraceEvent`) and
`frontend/src/types/events.ts` are two halves of one contract. **Change one, change
the other in the same commit.** A spec that adds a pipeline stage must list the new
`Stage` and where it is emitted.

### 2. Demo mode is deterministic and offline
The default experience needs no API key and no network. Tests run with
`DEMO_MODE=true` and must stay deterministic. No feature may make the offline path
depend on an external service.

### 3. Mock only reasoning and embeddings — everything else is real
Only the LLM reasoning/generation (`LLMProvider`) and embeddings are swapped for
mocks. The LangGraph loop, the Chroma vector store, the SQLite application database,
and MCP tool *execution* are always real, in both modes.

### 4. Bilingual by default (en/pt)
Every user-facing string the app renders ships in **both** English and Portuguese
(`{ en, pt }`, or `strings.ts` for UI chrome). Code, protocols, and proper nouns
(cloud service names) stay plain strings. A feature is not done until its `pt` text
exists alongside its `en` text. *(This rule governs app text; these SDD documents
themselves are developer-facing and written in English.)*

### 5. Cloud-agnostic, never forked
The visual model carries a `generic` role plus a `clouds: { azure, aws, gcp }` map.
Add provider names to the map; **never fork the app per cloud.** A new tier/station
fills all three of azure/aws/gcp.

### 6. One source of truth for the visual model
`frontend/src/lib/stations.ts` owns tiers, stations, hops, and the network boundary.
Geometry lives in `lib/layout.ts`, identity/content in `stations.ts`. **Every `Stage`
maps to exactly one station's `stages` array**, or the projection breaks.

### 7. The frontend is a pure projection
`deriveView(events, cursor)` turns the event log into everything the canvas draws.
Live streaming and step/replay are the same code path. No view state may exist that
cannot be derived from the event log.

### 8. Single-instance by design
Trace state and in-process memory assume one instance. No feature may silently
require shared cross-replica state without saying so explicitly in its spec.

### 9. Test-first (TDD)
Acceptance criteria become failing tests **before** implementation. Cycle:
red → green → refactor. Tests must run fully offline and deterministically.

### 10. Spec-first (SDD)
No feature code without a spec under `specs/`. The spec is the source of truth for
*what* and *why*; the plan for *how*; tasks for *the work*. See `specs/README.md`.

---

## Quality gates (must pass before "done")

These mirror `.github/workflows/ci.yml`:

- `ruff check .` and `ruff format .` — backend lint (line-length 100, E501 ignored).
- `pytest -q` — backend tests, Python 3.12, offline (`DEMO_MODE=true`).
- `npm run build` — frontend `tsc --noEmit` + `vite build`, Node 20.

Plus the cross-cutting gates from the principles above: protocol mirror (§1),
bilingual strings (§4), cloud map filled (§5), every Stage mapped to a station (§6).

---

## Amendment process

This document changes only by intent, not by accident:

1. Propose the change in the PR / spec that needs it, with a one-line rationale.
2. Update this file in the **same** change.
3. If an existing spec now conflicts, reconcile it or mark it superseded.

---

*Ratified: 2026-05-26 · Maintainer: Reginaldo Silva*
