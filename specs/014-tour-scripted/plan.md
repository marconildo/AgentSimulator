# Plan: Scripted, anchored guided tour

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> Frontend-only; **extends `005-guided-tour`** (reuses its tested reducer) and
> `004-timeline-phases` (`phaseMarkers`). No backend, no protocol, no new `Stage`.

## Approach

Keep `005`'s pure tour reducer (`tourSteps`/`tourStep`/…) — it already yields one
ordered `{ cursor, station, phase }` stop per occurring phase, so **AC1 is already
satisfied**; we only extend its test to pin that `station` is exposed. Three additions
turn the "quiet phase-walk" into a teaching tour:

1. **Emphasis is a projection.** Thread the tour's current station into `deriveView` as
   an optional `tourStation` argument; `DerivedView` gains `emphasizedStation`. Exactly
   one station is emphasized while a stop is active; idle/done → `null` (AC2/AC3). The
   store passes `currentStep(tour)?.station` (or `null` when not touring) when it
   derives. This keeps the canvas a pure projection (§3/§7) and makes AC2/AC3
   unit-testable in `derive.test.ts` with no React.
2. **Anchored balloon.** Rewrite `TourCaption` to render the narration **next to the
   emphasized node** instead of pinned to the bottom: it reads that node's laid-out
   position from `layout.ts` (the single owner of geometry) and the React Flow viewport
   transform, and points a small connector at the node. Salience is raised (size,
   contrast, a numbered "stop k/N").
3. **Canned trace for the empty state.** Ship a captured **real** run as a static
   `tourTrace` module (`TraceEvent[]`). From an empty state, `startTour` loads it into
   the simulator (`events` + `cursor`) and begins; the ▶ Tour control is no longer
   disabled when there are no events (supersedes 005 AC5's empty-state gating). New
   narration copy (longer, scripted, per phase) replaces the terse 005 captions.

*Alternatives considered:* (a) computing emphasis inside `FlowCanvas` from the store
instead of in `deriveView` — rejected: AC2 explicitly wants it in the **derived view**,
and keeping it in the one projection avoids a second source of truth. (b) Hand-authoring
the canned trace — rejected: violates §everything-is-real; it must be a captured real
run, documented and guarded by a test.

## Affected files

**Backend**
- none at runtime. *(Dev only: a documented one-off capture — run a real turn, fetch
  `GET /api/trace/{id}`, save as the frontend fixture below. No app code changes.)*

**Frontend**
- `frontend/src/lib/derive.ts` — add optional `tourStation?: StationId | null` param;
  add `emphasizedStation: StationId | null` to `DerivedView` (= `tourStation` when
  touring, else `null`).
- `frontend/src/lib/derive.test.ts` — AC2/AC3 tests for `emphasizedStation`.
- `frontend/src/lib/tour.ts` — add `tourNarrationFor(lang)` (the new longer scripted
  copy, cached per language); `tourSteps`/`tourStep`/`currentStep` unchanged.
- `frontend/src/lib/tour.test.ts` — extend AC1 (assert `station` exposed per stop);
  AC4 (narration parity en/pt, non-empty per phase); AC5 (pause/resume inert) preserved.
- `frontend/src/lib/tourTrace.ts` *(new)* — the bundled canned trace (a captured real
  run) as `TraceEvent[]`, with a provenance comment (when/how captured).
- `frontend/src/lib/tourTrace.test.ts` *(new)* — guard: every event's `stage` is in
  `STAGE_TO_STATION`, and `deriveView(tourTrace, last)` reaches a finished run (AC6).
- `frontend/src/store/useSimulator.ts` — `startTour` loads `tourTrace` when `events` is
  empty (AC6); derive is called with the tour station so `emphasizedStation` flows to
  the canvas; emphasis released on stop/done (AC3). Replay↔tour mutual exclusion kept.
- `frontend/src/store/useSimulator.tour.test.ts` — AC6 (empty-state ▶ Tour loads the
  canned trace and begins); emphasis cleared on stop/done.
- `frontend/src/components/TourCaption.tsx` — anchor the balloon to the emphasized
  node (position from `layout.ts` + viewport transform), render the new narration,
  raise salience, point a connector at the node.
- `frontend/src/components/TourControls.tsx` — empty-state ▶ Tour enabled (loads canned
  trace) with a clear "preview the journey" affordance; higher salience.
- `frontend/src/components/FlowCanvas.tsx` (or `StationNode`) — render the
  `emphasizedStation` highlight (visually distinct from `selected`).
- `frontend/src/i18n/strings.ts` — new `tour.narration` map (en + pt, one line per
  phase) + an empty-state CTA string; keep `tour.start/pause/resume/stop`.

## Protocol changes (constitution §1)

None. The tour only *reads* trace events, `phaseMarkers`, and `STAGE_TO_STATION`, and
writes UI state (`cursor`, `selected`, tour state, `emphasizedStation`).

## Data model changes

None. The canned trace is a static frontend asset, not a DB/vector-store row.

## i18n strings (constitution §4)

New longer scripted narration, one line per `TimelinePhase`, en + pt (replaces the
terse 005 captions), plus the empty-state CTA. Final prose written in T4; shape:

| key / location | en | pt |
|---|---|---|
| `tour.cta.empty` | ▶ Preview the journey | ▶ Pré-visualizar a jornada |
| `tour.narration.request` | 👉 Your message leaves the browser and travels to the API over HTTPS — the request begins here. | 👉 Sua mensagem sai do navegador e viaja até a API por HTTPS — a requisição começa aqui. |
| `tour.narration.memory` | 👉 The backend reads recent turns from the database — the agent's long-term memory. | 👉 O backend lê os turnos recentes do banco — a memória de longo prazo do agente. |
| `tour.narration.route` | 👉 The agent reads the request and plans its route before doing any work. | 👉 O agente lê a requisição e planeja sua rota antes de qualquer trabalho. |
| `tour.narration.retrieve` | 👉 RAG turns your question into a vector and pulls the most relevant chunks from the index. | 👉 O RAG transforma sua pergunta em vetor e busca os trechos mais relevantes no índice. |
| `tour.narration.reason` | 👉 The model reasons over the assembled context and decides whether it needs a tool. | 👉 O modelo raciocina sobre o contexto montado e decide se precisa de uma ferramenta. |
| `tour.narration.tools` | 👉 A tool runs over MCP and hands an observation back to the agent to reason on. | 👉 Uma ferramenta roda via MCP e devolve uma observação para o agente raciocinar. |
| `tour.narration.generate` | 👉 With everything in hand, the model writes the answer one token at a time. | 👉 Com tudo em mãos, o modelo escreve a resposta um token por vez. |
| `tour.narration.respond` | 👉 The finished answer streams back across the network to your browser. | 👉 A resposta pronta volta pela rede, em streaming, até o seu navegador. |
| `tour.narration.persist` | 👉 The turn is written to the database so the next message remembers this one. | 👉 O turno é salvo no banco para que a próxima mensagem lembre desta. |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Pure functions (reducer, projection, narration parity, canned-trace guard) with Vitest;
balloon anchoring + control salience guarded by `tsc`/`npm run build` + manual verify
(no RTL in repo).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `tourSteps` yields one ordered stop per phase, each exposing `cursor` **and** `station` | `frontend/src/lib/tour.test.ts` |
| AC2 | `deriveView(events, upto, station)` sets `emphasizedStation === station` (exactly one) while touring; `null` when no `tourStation` | `frontend/src/lib/derive.test.ts` |
| AC3 | past-last advance → `status: "done"` and the store derives with `null` ⇒ no emphasis / no forced selection | `tour.test.ts` + `useSimulator.tour.test.ts` |
| AC4 | every `TimelinePhase` has non-empty narration in en **and** pt | `tour.test.ts` (parity) |
| AC5 | paused tick is inert; resume continues from the same stop | `tour.test.ts` |
| AC6 | empty-state `startTour` loads `tourTrace` + begins; every canned event maps via `STAGE_TO_STATION` and the run finishes | `useSimulator.tour.test.ts` + `tourTrace.test.ts` |

## Risks / trade-offs

- **Balloon anchoring** is the fiddly bit: positioning relative to a node means reading
  `layout.ts` coordinates and the React Flow viewport transform (pan/zoom). Mitigate by
  reusing layout positions (the single geometry owner) and clamping the balloon inside
  the canvas; fall back to a near-node fixed offset if the transform is unavailable.
- **Canned-trace staleness** — if the event protocol (§1) changes, the captured trace
  can drift. The `tourTrace.test.ts` guard (all stages mapped + run finishes) fails loud
  when it does; the doc records how to re-capture.
- **Supersedes 005 AC5 in the empty state** — note the intentional change so the empty-
  state-gating test from 005 is updated, not silently broken.
- **Two timers** (replay + tour) stay mutually exclusive, as in 005 (`stopTimer`).
