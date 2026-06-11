# Plan: RAGLESS retrieval (PageIndex) — parallel comparison box

> HOW for `spec.md` (clarified). Respects the constitution; no amendment needed
> (new Stages are additive; Simple stays byte-for-byte; everything is real).

## Approach

Add a **second, real retrieval path** that runs *alongside* Vector RAG when a
per-conversation `ragless` toggle is on (Intermediate rung only). PageIndex is
implemented faithfully but minimally (D4): a **deterministic heading tree** over the
markdown corpus (pre-built at startup, cached) + a **single LLM navigation call**
(OpenAI, via `ChatOpenAI`) that reasons over the tree's outline and selects the
relevant node(s). The selected sections' text becomes the **grounding context** the
model answers from (D3 — PageIndex replaces Vector RAG for grounding); the Vector RAG
path still runs and animates for **side-by-side display** only.

The path is wired into the existing `search_knowledge_base` tool body
(`_run_retrieval_tool` in `graph.py`): on `scenario==intermediate and ragless`, it runs
`rag_retrieve` (display, emits `rag.*`) then `pageindex_retrieve` (emits `pageindex.*`)
and returns the PageIndex context as the tool observation. Off / Simple → unchanged.

**Alternatives considered:** (a) a *separate* tool the model elects — rejected: the
model would pick one, defeating the side-by-side comparison. (b) iterative node-by-node
tree walk — rejected for cost/determinism; a single navigation call still visualizes the
tree + chosen path. (c) the real `pageindex` PyPI lib — rejected: PDF-oriented, external
API/key, less controllable for the stage-by-stage viz (constitution §3 is satisfied by a
real in-repo tree + real LLM navigation).

## Affected files

**Backend**
- `backend/app/schemas.py` — 3 new `Stage`s (`PAGEINDEX_TREE/NAVIGATE/SELECT`); new
  `ChatRequest.ragless: bool = False`.
- `backend/app/rag/pageindex.py` *(new)* — `build_tree()` (cached, parses corpus markdown
  headings into a hierarchical node tree); `navigate(tree, query)` (LLM call → selected
  ids + reasoning); `pageindex_retrieve(query, emitter, session_id)` → `(context, chunks)`,
  emitting `pageindex.tree → navigate → select`.
- `backend/app/agent/state.py` — `AgentState.ragless: bool`.
- `backend/app/agent/graph.py` — `_run_retrieval_tool` branches on `ragless`; `run_agent`/
  `run_agent_state` gain `ragless: bool = False`, thread into initial state.
- `backend/app/main.py` — read `req.ragless`, pass to `run_agent`; echo in `request_body`
  when true; `GET /api/config` exposes `ragless_default`; lifespan warms `build_tree()`.
- `backend/app/config.py` — (optional) `ragless_default: bool = False`.

**Frontend**
- `frontend/src/types/events.ts` — mirror the 3 new `Stage` literals.
- `frontend/src/lib/stations.ts` — new `pageindex` `StationId` + station def (data tier,
  below `rag`), agent→pageindex hop, `scenarios:[intermediate,advanced]`, `showRagless`
  param on `visibleStationsFor`/`visibleHopsFor`/`computeLayout` wrappers, `STAGE_TO_STATION`
  entries, tag glossary, why/whatBreaks, cloud map.
- `frontend/src/lib/layout.ts` — geometry for `pageindex` (COLUMNS/TIER_OF/EXPANDED_H),
  `showRagless` plumbed into `computeLayout`.
- `frontend/src/lib/phases.ts` — 3 new stages → `"retrieve"`.
- `frontend/src/lib/pageindexPipeline.ts` *(new)* — `derivePageIndexPipeline(events,cursor)`
  → Tree → Navigate → Select → Augmented (pure projection, like `ragPipeline.ts`).
- `frontend/src/components/PageIndexPipelinePanel.tsx` + `PageIndexStageDetail.tsx` *(new)*
  — anchored drill-in panel mirroring `RagPipelinePanel`.
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor` case `"pageindex"`; node "open
  RAGLESS pipeline" button → `detail`.
- `frontend/src/components/InspectorPanel.tsx` — `renderDetail` case `"pageindex"`.
- `frontend/src/components/SettingsExperiment.tsx` — `ragless` toggle (Intermediate-only).
- `frontend/src/lib/experiment.ts` — `ragless` + `setRagless`; `overridesFor` sends
  `ragless:true` only when enabled (backend gates Intermediate).
- `frontend/src/App.tsx` — `HAS_DETAIL` += `pageindex`; render the panel on `detail==="pageindex"`;
  pass `showRagless` (from `useExperiment`) into the layout.
- `frontend/src/i18n/strings.ts` — new en+pt strings (toggle, readout, glossary, panel).

## Protocol changes (constitution §1)
- `schemas.py` — `Stage.PAGEINDEX_TREE="pageindex.tree"`, `PAGEINDEX_NAVIGATE="pageindex.navigate"`,
  `PAGEINDEX_SELECT="pageindex.select"`.
- `events.ts` — mirror the three literals in the `Stage` union.
- Emitted in: `backend/app/rag/pageindex.py` (`pageindex_retrieve`), only on the
  Intermediate+ragless branch of `_run_retrieval_tool`.
- Mapped in `stations.ts` `STAGE_TO_STATION` → `pageindex`; `phases.ts` `STAGE_TO_PHASE` →
  `"retrieve"`.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) `case "pageindex"`: **yes**.

## Data model changes
None. No new SQLite table, no Chroma change. The heading tree is built in-process from
the existing corpus files and cached (`functools.lru_cache`); optionally serialized to a
JSON artifact under `app/data/pageindex/` for inspection (gitignored), not a DB.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `pageindex` station title | `RAGLESS` | `RAGLESS` |
| `pageindex` subtitle | `PageIndex · tree search` | `PageIndex · busca em árvore` |
| glossary `RAGLESS` | `Reasoning-based retrieval: navigate a document tree with an LLM instead of vector similarity — no embeddings, no vector DB.` | `Recuperação por raciocínio: a LLM navega uma árvore do documento em vez de similaridade vetorial — sem embeddings, sem banco vetorial.` |
| readout `building tree` / `navigating` / `selected N` | `building tree` / `navigating` / `selected {n}` | `montando árvore` / `navegando` / `{n} selecionado(s)` |
| Settings toggle label | `RAGLESS (PageIndex)` | `RAGLESS (PageIndex)` |
| Settings toggle help | `Run reasoning-based retrieval alongside Vector RAG to compare. Intermediate rung only.` | `Roda recuperação por raciocínio junto do RAG vetorial para comparar. Só no nível Intermediário.` |
| panel steps Tree/Navigate/Select/Augmented | `Document tree` / `Navigate` / `Select` / `Augmented` | `Árvore do documento` / `Navegar` / `Selecionar` / `Aumentado` |
| node button | `Open RAGLESS pipeline` | `Abrir pipeline RAGLESS` |
| RAG Augmented "not used this turn" note | `Not used for grounding (RAGLESS active)` | `Não usado como contexto (RAGLESS ativo)` |

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| `pageindex` station | Reasoning-based retrieval (LLM tree search) | Azure OpenAI + Azure AI Search (semantic) | Bedrock + Kendra | Vertex AI + LLM tree search |

(The point is it is *not* a vector DB; the cloud examples are the model + a managed search
that supports reasoning/semantic navigation. Generic role is the load-bearing label.)

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 (ragless off byte-for-byte) | `run_agent_state(ragless=False)` emits no `pageindex.*` | `backend/tests/test_ragless.py` |
| AC2 (Intermediate-only) | `ragless=True, scenario=simple` → no `pageindex.*` | `backend/tests/test_ragless.py` |
| AC3 (real path, no embedding) `[openai]` | `pageindex_retrieve` selects a node, context non-empty, no embed in path | `backend/tests/test_pageindex.py` |
| AC4 (both run, PageIndex grounds) `[openai]` | `ragless=True, intermediate`: both `rag.*` + `pageindex.*`; retrieval ToolMessage == PageIndex context | `backend/tests/test_ragless.py` |
| AC5 (protocol mirror + phases) | stages present in `STAGE_TO_STATION`/`STAGE_TO_PHASE` | `phases.test.ts`, `stations.test.ts` |
| AC6 (station + conditional box) | `pageindex` station, `showRagless` hides/shows, glossary tag, why/whatBreaks | `stations.test.ts` |
| AC7 (drill-in pipeline) | `derivePageIndexPipeline` stage statuses | `pageindexPipeline.test.ts` |
| AC8 (off unchanged) | covered by AC1 + existing core-pipeline tests | — |
| AC9 (bilingual) | every new station/glossary/strings key has en+pt (existing jargon/strings tests) | `strings.test.ts`, `stations.test.ts` |
| tree unit (no key) | `build_tree()` parses headings into a hierarchy | `backend/tests/test_pageindex_tree.py` |

## Risks / trade-offs
- **Determinism:** the navigation is an LLM call → assert structurally (a node selected,
  context non-empty, reasoning present), never an exact node id (model variability).
- **Extra latency/cost when on:** two retrieval paths + one navigation LLM call per turn.
  Acceptable — it is an opt-in teaching toggle, off by default.
- **Tree freshness:** cached per process; corpus is static, rebuilt on restart — matches
  the single-instance assumption (§7). A corpus change needs a restart (same as Chroma).
- **Augmented ambiguity:** with both paths, `llm.prompt.retrieved` reflects the *PageIndex*
  grounding (D3); the RAG box's Augmented shows the "not used this turn" note so the learner
  isn't misled that the vector result grounded the answer.
