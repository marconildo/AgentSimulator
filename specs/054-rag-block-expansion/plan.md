# Plan: RAG block expansion (Vector DB → full RAG drill-in + real reranker)

> Status `clarified` (2026-06-10). Decisions respect `.specify/constitution.md`
> (notably §3 everything-is-real, §1 protocol-is-the-contract, §4 bilingual, §8 single-instance).

## Approach

The reranker becomes a **real query-time pass** that runs only on the Intermediate branch of
the agent graph. After `search_knowledge_base` retrieves a **wider candidate pool** (`fetch_k`,
e.g. 8–12), a local reranker re-scores those candidates against the query and the **trimmed,
reordered top-`top_k`** becomes the grounding context. The retrieval tool already centralizes
RAG access (026-agent-tool-autonomy), so the rerank slots in there, behind a
`scenario == "intermediate"` guard — Simple's path is literally unchanged.

**Reranker → local FlashRank.** Via LangChain's `FlashrankRerank`
(`langchain_community.document_compressors`) backed by `flashrank` + `onnxruntime` (no `torch`),
default model `ms-marco-MiniLM-L-12-v2` (~CPU-fast, ~tens of MB). It is **real** (constitution
§3) and **deterministic**, so tests can assert reordering tightly while keeping structural
asserts for robustness. The model is loaded **lazily** on first rerank (mirrors 052's lazy
Tavily import) and cached so cold-start stays off the Simple path. A thin
`rerank(query, candidates) -> ranked` helper in `backend/app/rag/` wraps the FlashRank call so
the call site in `tools.py` stays clean and unit-testable; the model is downloaded/cached to a
local dir (configurable, baked into the image build for offline CI).

**Frontend** reuses the **`AgentDetail` overlay pattern** for a new `RagDetail` drill-in opened
from the `rag` station's "open full view". It is a **pure projection** over existing events:
Chunking + Embedding panels read `rag.ingest.*` / `rag.embed`; Retrieval reads `rag.search` /
`rag.retrieve`; Reranking reads the new `rag.rerank` (empty-state when absent). No new requests,
no new store state beyond a `detail`-style flag.

## Affected files

**Backend**
- `backend/app/schemas.py` — add `Stage.RAG_RERANK = "rag.rerank"`.
- `backend/app/rag/reranker.py` *(new)* — `rerank(query, candidates, top_k) -> ranked` wrapping
  LangChain `FlashrankRerank`; lazy + cached model load; returns each candidate's pre-rank +
  post-rerank score/rank for the trace `data`.
- `backend/app/rag/retriever.py` — support a wider `fetch_k` fetch (pool larger than `top_k`).
- `backend/app/agent/tools.py` — `search_knowledge_base`: fetch the wider pool, and when
  `scenario == "intermediate"`, run the rerank pass inside an `emitter.stage(Stage.RAG_RERANK)`
  between `rag.search` and `rag.retrieve`; trim to `top_k`.
- `backend/app/agent/graph.py` / `state.py` — ensure `scenario` + `emitter` reach the tool
  (already threaded via `config["configurable"]`); no new node.
- `backend/app/main.py` — flip `SCENARIOS` `intermediate.available → True`.
- `backend/requirements.txt` — add `flashrank` (pulls `onnxruntime`; **no `torch`**).
- `backend/Dockerfile` — pre-download the FlashRank model into the image so CI/offline cold
  starts don't fetch at runtime.

**Frontend**
- `frontend/src/types/events.ts` — mirror `Stage.RAG_RERANK`.
- `frontend/src/lib/stations.ts` — `reranker`: drop `comingSoon`, set `stages: ["rag.rerank"]`;
  add `rag` station's "open full view" hook (detail id).
- `frontend/src/lib/phases.ts` — map `rag.rerank` to a `TimelinePhase` (retrieval phase).
- `frontend/src/lib/scenario.ts` — `AVAILABLE.intermediate → true`.
- `frontend/src/lib/derive.ts` — surface rerank into the view (reranker station status/readout).
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor` case for `reranker`.
- `frontend/src/components/InspectorPanel.tsx` — `renderDetail` case for `reranker`.
- `frontend/src/components/RagDetail.tsx` *(new)* — the drill-in overlay (mirrors `AgentDetail`).
- `frontend/src/store/useSimulator.ts` — `detail`/`ragDetailOpen` flag + open/close action.
- `frontend/src/i18n/strings.ts` + `stations.ts` glossary — en/pt for new prose.

## Protocol changes (constitution §1)
- `backend/app/schemas.py` — `Stage.RAG_RERANK = "rag.rerank"`.
- `frontend/src/types/events.ts` — mirrored `RAG_RERANK`.
- Emitted in: `backend/app/agent/tools.py` (`search_knowledge_base`, Intermediate branch only).
- Mapped to station in `stations.ts`: `reranker` (`stages: ["rag.rerank"]`).
- `phases.ts`: `rag.rerank → <retrieval phase>` (keeps `Record<Stage, TimelinePhase>` total).
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel): **yes** — `reranker` case in both.

## Data model changes
None. No vector-store schema change (rerank is query-time over existing chunks); no SQLite
table change. `trace_events` (048) persists the new `rag.rerank` event automatically (denormalized).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `reranker` readout (FlowCanvas) | `reranked · top {k}` | `reordenado · top {k}` |
| RagDetail panel: Chunking | `Chunking` | `Chunking` |
| RagDetail panel: Embedding | `Embedding` | `Embedding` |
| RagDetail panel: Retrieval | `Retrieval` | `Recuperação` |
| RagDetail panel: Reranking | `Reranking` | `Reranking` |
| RagDetail rerank empty-state | `Not on this rung` | `Não neste nível` |
| glossary `Reranker` | (cross-encoder/listwise rerank explainer) | (idem pt) |

> Exact strings finalized during implementation; all land in both languages (no en-only).

## Cloud map (constitution §5)
`reranker` already carries its `clouds` (Azure AI Search semantic ranker · Bedrock/Cohere
Rerank · Vertex Ranking API) and `generic`. No new tier. **n/a** for new cloud entries.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | rerank fires after search/before retrieve on intermediate; never on simple | `backend/tests/test_rag_rerank.py` `@pytest.mark.openai` (full agent run) |
| AC2 | rerank END carries pre/post ranks; grounding uses reranked order | `backend/tests/test_rag_rerank.py` |
| AC2 (unit) | `rag/reranker.py` reorders a crafted candidate set deterministically | `backend/tests/test_reranker_unit.py` (no key — FlashRank is local) |
| AC3 | byte-for-byte stage list on simple unchanged | `backend/tests/test_scenario_isolation.py` |
| AC4 | schemas↔events mirror; STAGE_TO_STATION/PHASE totality + parity | existing `test_protocol_mirror` + `phases.test.ts` |
| AC5 | reranker not comingSoon; visibleStationsFor includes it; readout/detail render | `stations.test.ts`, `FlowCanvas.test.tsx`, `InspectorPanel.test.tsx` |
| AC6 | RagDetail renders 4 panels; empty rerank state on simple | `RagDetail.test.tsx` |
| AC7 | canSend(intermediate)=true; /api/config available; send enabled | `scenario.test.ts`, `backend/tests/test_config.py` |
| AC8 | new strings present in en + pt | i18n parity test / `stations.test.ts` |

## Risks / trade-offs
- **Determinism.** FlashRank is deterministic → tests can assert the reordering tightly; still
  keep one structural assert (top differs from raw search on a crafted case) to stay robust to
  model/version bumps.
- **New dependency / image size.** `flashrank` + `onnxruntime` add weight but **no `torch`** —
  far lighter than a `sentence-transformers` CrossEncoder. Model is pre-baked into the image so
  runtime/CI never downloads it.
- **Cold start.** Model load is lazy + cached and only on the Intermediate branch → Simple never
  pays it; first Intermediate rerank eats the one-time load.
- **Latency.** Extra local rerank per retrieval on Intermediate only (CPU, ~tens of ms for ~10
  candidates); no token cost (local model). Fits Intermediate's "RAG quality" story.
- **Totality drift.** Forgetting the `phases.ts` / `STAGE_TO_STATION` mapping breaks `tsc`/CI —
  caught by AC4 tests first (TDD).
- **Simple regression.** AC3 is the guardrail; it must be the first test written.
