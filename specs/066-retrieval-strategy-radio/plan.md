# Plan: Retrieval strategy is a radio (Vector RAG ⊻ RAGLESS)

> HOW for `066-retrieval-strategy-radio`. Respects the constitution; no principle bends.

## Approach

Two coordinated changes, FE selection-model + backend routing, no protocol change.

**Frontend — model retrieval as a radio (like `runtime`).** Introduce
`RetrievalStrategy = "vector" | "ragless"` in `selection.ts` with a store field
`retrieval` and `setRetrieval` (a radio: exactly one active, mirrors `setRuntime`).
**Remove `rag` and `ragless` from `ComponentId`** — they are no longer independent
checkboxes; they are the two ends of the radio. The fixed skeleton and `mcp` stay locked
checkboxes. `resolveStations`, `requestInputs`, and `classify` take the strategy as an
argument: `rag` station shows iff `vector`, `pageindex` station shows iff `ragless`;
`requestInputs.ragless = retrieval === "ragless"`. Reranker and Hybrid search now hard-depend
on the **strategy** being `vector` (replacing their `REQUIRES: "rag"` component dependency),
so they're auto-cleared and un-toggleable under RAGLESS. `loadSelection` migrates any
persisted selection that still lists `"rag"`/`"ragless"` in `enabled` into the new
`retrieval` field (presence of `"ragless"` → `"ragless"`, else `"vector"`) and strips them.

*Alternative considered:* keep `rag`/`ragless` as checkboxes and just auto-uncheck the
other in `toggle`. Rejected — the user picked the radio (honest "pick exactly one", matches
the runtime control), and leaving `rag` "locked" while it can be turned off is incoherent.

**Backend — RAGLESS replaces, not augments, the vector path.** In `graph.py`
`_run_retrieval_tool`, when `state["ragless"]` is true, **do not call `rag_retrieve`** —
run only `pageindex_retrieve`. So no `rag.*` stages fire and the grounding/observation comes
straight from PageIndex (this is the 056 behaviour minus the side-by-side vector run). In
`main.py` `_retrieved_chunks`, fall back to the `PAGEINDEX_SELECT` END event's `chunks` when
there is no `RAG_RETRIEVE` END event, so the persisted message chunks (→ "Sources used")
reflect the PageIndex-selected sections. PageIndex chunks (`_to_chunk`) already carry
`source`/`text`/`score`/`uploaded`, so they render in the existing Sources panel unchanged.

## Affected files

**Backend**
- `backend/app/agent/graph.py` — `_run_retrieval_tool` (~L432–450): branch so `ragless` skips
  the vector `rag_retrieve` call entirely; only `pageindex_retrieve` runs.
- `backend/app/main.py` — `_retrieved_chunks` (~L51): fall back to the latest
  `PAGEINDEX_SELECT` END event's `chunks` when no `RAG_RETRIEVE` END event exists.

**Frontend**
- `frontend/src/lib/selection.ts` — new `RetrievalStrategy` + `retrieval`/`setRetrieval`;
  drop `rag`/`ragless` from `ComponentId`, `ALL_COMPONENTS`, `LOCKED_COMPONENTS`,
  `COMPONENT_STATION`, `COMPONENT_IS_REAL`, `COMPONENT_FLOOR`; add `RETRIEVAL_STRATEGIES`,
  `RETRIEVAL_FLOOR`, `RETRIEVAL_IS_REAL`; thread `retrieval` through `resolveStations`,
  `requestInputs`, `classify`, `resolvedSelection`, `selectionOf`, `useResolvedSelection`,
  `useMaturity`, `currentRequestInputs`, `currentMaturity`, `DEFAULT_SELECTION`; rerank/hybrid
  `REQUIRES` → strategy-gated (`canToggle`/`dependencyMet` consult `retrieval`); `loadSelection`
  + `persist` carry `retrieval` and migrate legacy `enabled` entries.
- `frontend/src/components/ScenarioBuilder.tsx` — render a **Retrieval strategy** radio
  (Vector RAG ⊻ RAGLESS) atop the "Retrieval & Data" group; the group's checkbox list becomes
  `["rerank","hybrid"]`, dimmed with the "requires Vector RAG" tooltip while strategy ≠ vector.
- `frontend/src/i18n/strings.ts` — `builder`: add `retrievalHeading` + a `retrievalStrategies`
  record (`vector`/`ragless` → `{ name, blurb }`); remove the `rag`/`ragless` keys from the
  `components` record (type union shrinks). en + pt.

**Unchanged on purpose**
- `frontend/src/lib/experiment.ts` — `currentRequestInputs()` keeps the
  `{ rerank, runtime, ragless }` shape, so the request builder needs no edit.
- `frontend/src/lib/stations.ts` `visibleStationsFor` — consumes the resolved station set;
  rag/pageindex visibility now flows from the strategy through `resolveStations`.
- `backend/app/schemas.py` — `ChatRequest.ragless` already exists; no protocol change.

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent` added or changed; this only re-routes which existing
stages (`rag.*` vs `pageindex.*`) fire and changes their FE visibility selection. No
`events.ts` mirror edit, no new `STAGE_TO_STATION`/`STAGE_TO_PHASE`/`readoutFor`/`renderDetail`
case (the `rag` and `pageindex` stations + their stages already exist).

## Data model changes

None. (No Chroma change; no SQLite schema change. Persisted message `chunks` already store
whatever `_retrieved_chunks` returns — now possibly PageIndex sections.)

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `builder.retrievalHeading` | Retrieval strategy | Estratégia de recuperação |
| `builder.retrievalStrategies.vector.name` | Vector RAG | Vector RAG |
| `builder.retrievalStrategies.vector.blurb` | Embed the query and search the vector index for the most similar chunks. | Gera embedding da consulta e busca no índice vetorial os chunks mais similares. |
| `builder.retrievalStrategies.ragless.name` | RAGLESS | RAGLESS |
| `builder.retrievalStrategies.ragless.blurb` | Reasoning-based retrieval (PageIndex tree search) — no embeddings, no vector DB. | Recuperação baseada em raciocínio (busca na árvore PageIndex) — sem embeddings, sem banco vetorial. |
| `builder.requiresRag` (existing) | requires Vector RAG | requer Vector RAG |

(The removed `builder.components.rag` / `builder.components.ragless` strings move into
`retrievalStrategies`.)

## Cloud map (constitution §5)

n/a — no new tier/station. `rag` (Vector DB) and `pageindex` (RAGLESS) stations already carry
their `clouds` maps.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 mutual exclusion | `setRetrieval` flips the active strategy; never both | `frontend/src/lib/selection.test.ts` |
| AC2 default unchanged | default strategy `vector`; stations have `rag` not `pageindex`; `currentRequestInputs().ragless === false` | `frontend/src/lib/selection.test.ts` |
| AC3 request inputs | `requestInputs` for `ragless` → `{ragless:true, rerank:false}`; for `vector`+rerank → `{ragless:false, rerank:true}` | `frontend/src/lib/selection.test.ts` |
| AC4 station visibility | `resolveStations` includes `pageindex`/excludes `rag` under `ragless`, and vice-versa | `frontend/src/lib/selection.test.ts` + `ragless-visibility.test.ts` |
| AC5 rerank/hybrid gated | `canToggle("rerank")`/`("hybrid")` false under `ragless`; switching to `ragless` clears `rerank` | `frontend/src/lib/selection.test.ts` |
| AC6 backend skips vector | `ragless=True` → no `rag.*` stages, `pageindex.*` present + grounds | `backend/tests/test_ragless.py` (rewrite `test_..._runs_both_paths...`) |
| AC7 default unchanged | `ragless=False` → no `pageindex.*`; `rag.*` present (existing guards) | `backend/tests/test_ragless.py` |
| AC8 honest sources | `_retrieved_chunks` returns PageIndex sections when only `pageindex.select` END exists | `backend/tests/test_api.py` or new `test_main_chunks.py` (unit, keyless) |

FE tests run under Vitest (no key); the `[openai]`-marked `test_ragless.py` drives the real
graph. AC8's `_retrieved_chunks` test is a pure unit over a hand-built emitter event list →
keyless, no model.

## Risks / trade-offs

- **Lost the 056 side-by-side comparison.** Running both paths was a deliberate teaching
  device; we drop it for honesty. Mitigation: the RAGLESS pipeline panel already explains the
  reasoning path; the radio makes the either/or explicit. (Recorded in spec Out-of-scope.)
- **localStorage migration.** Old `agentsim.selection` blobs list `rag`/`ragless` in `enabled`;
  `loadSelection` must map+strip them or the stored array silently drops a now-unknown id and
  loses the user's RAGLESS choice. Covered by a `loadSelection` migration test.
- **Demo mode (058).** Captured traces were recorded with the old "run both" behaviour; a
  RAGLESS demo trace may still contain `rag.*` events. Not in scope to re-capture — verify the
  demo build still renders (the canvas tolerates extra stages); note if a re-capture is needed.
