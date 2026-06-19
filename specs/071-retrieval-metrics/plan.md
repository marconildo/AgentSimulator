# Plan: Retrieval-quality metrics (Precision@k · Recall@k · MRR)

> HOW for [`spec.md`](spec.md). Respects the constitution: no new `Stage` (§1), everything real
> (§3 — real golden set, real math, honest "no ground truth"), bilingual (§4), `rag` station only
> (§6), single-instance unaffected (§7).

## Approach

A small **pure metrics module** computes Precision@k / Recall@k / MRR from a ranking + a relevant
set. A hand-authored **golden set** (JSON) lives beside the corpus. In `retriever.retrieve`, after
the final `rag.retrieve` chunks are chosen, we look the query up in the golden set; on a hit we
compute the metrics over the kept chunks' `source`s and attach an `eval` object to the `rag.retrieve`
END `data`. No hit ⇒ no `eval` (byte-for-byte). `/api/config` lists the benchmark queries so the UI
can offer them as chips. The frontend carries `eval` through `deriveRagPipeline` into the Retrieval
stage and renders a Quality block (numbers + per-chunk ✓/✗ + missed-relevant), or the honest
"no ground truth" line.

Alternatives considered: (a) a new `rag.metrics` `Stage` — rejected, heavier and the data is
intrinsically *about* the retrieval that just happened, so additive-on-`rag.retrieve` is the honest
shape (mirrors 036's `context_budget` on `llm.prompt`). (b) computing metrics for every query via an
LLM judge — rejected, that's RAGAS/Eval-Runner territory and not deterministic; hand-authored ground
truth is real and testable.

## Affected files

**Backend**
- `backend/app/data/retrieval_golden.json` *(new)* — the labelled golden set
  (`[{ id, query, relevant_sources }]`).
- `backend/app/rag/metrics.py` *(new)* — pure `precision_at_k`, `recall_at_k`, `mrr`, and an
  `evaluate(ranked_sources, relevant_sources, k)` returning the `eval` dict; `load_golden()` +
  `match_golden(query)` (normalised lookup).
- `backend/app/rag/retriever.py` — after the `rag.retrieve` chunks are built, call `match_golden`;
  on a hit, attach `eval` to `rec.data` (and `mrr`/`precision_at_k` into `rec.metrics`).
- `backend/app/main.py` — `/api/config` response gains `benchmark_queries` (id + query only).
- `backend/app/schemas.py` — **no change** (additive `data`; optionally a `# eval` doc comment on
  `TraceEvent` like the `context_budget` note).

**Frontend**
- `frontend/src/types/events.ts` — add `RetrievalEval` interface (optional, additive); document it
  on the `data` map note (mirror of the backend comment).
- `frontend/src/lib/ragPipeline.ts` — read `eval` off the `rag.retrieve` END into the `retrieval`
  stage `data` (pure projection); compute the per-chunk `relevant` flags into the chunk list.
- `frontend/src/components/RagStageDetail.tsx` — render the Quality block for the Retrieval stage
  (numbers, per-chunk ✓/✗, missed-relevant list) or the no-ground-truth line.
- `frontend/src/lib/config.ts` (or wherever `/api/config` is typed/consumed) — surface
  `benchmark_queries`.
- A benchmark-chip affordance: the RAG drill-in empty state and/or the composer suggestions — render
  the `benchmark_queries` as one-click chips that send the exact query.
- `frontend/src/i18n/strings.ts` — `ragDetail.quality.*` + glossary entries (en + pt).

## Protocol changes (constitution §1)

- No `Stage`/`Phase`/`TraceEvent` shape change. `eval` is an additive key on the existing
  `rag.retrieve` END `data` (open map). `events.ts` gains an **optional** `RetrievalEval` type only.
- Not emitted from any new node; computed inside `retriever.retrieve` where `rag.retrieve` is built.
- Station mapping unchanged (`rag.retrieve` already → `rag`); `STAGE_TO_STATION` / `STAGE_TO_PHASE`
  untouched. `readoutFor` / `renderDetail` need no new `StationId` case (it's the existing `rag`).

## Data model changes

None. No Chroma or SQLite schema change. The golden set is a static data file (like the corpus),
not a table — consistent with `docs/data-model.md` "what's NOT a table".

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `ragDetail.quality.title` | Retrieval quality | Qualidade da recuperação |
| `ragDetail.quality.precision` | Precision@k | Precisão@k |
| `ragDetail.quality.recall` | Recall@k | Revocação@k |
| `ragDetail.quality.mrr` | MRR | MRR |
| `ragDetail.quality.relevant` | relevant | relevante |
| `ragDetail.quality.notRelevant` | not relevant | não relevante |
| `ragDetail.quality.missed` | Relevant chunks missed | Trechos relevantes não recuperados |
| `ragDetail.quality.noGroundTruth` | No ground truth for this query — metrics need a labelled benchmark query. | Sem gabarito para esta pergunta — as métricas precisam de uma pergunta de benchmark rotulada. |
| `ragDetail.quality.tryBenchmark` | Try a benchmark query | Experimente uma pergunta de benchmark |
| glossary `Precision@k` | Of the top-k retrieved chunks, the fraction that are relevant. | Dos k trechos recuperados no topo, a fração que é relevante. |
| glossary `Recall@k` | Of all relevant chunks, the fraction that made the top-k. | De todos os trechos relevantes, a fração que entrou no top-k. |
| glossary `MRR` | Mean Reciprocal Rank — 1/(rank of the first relevant chunk); higher is better. | Mean Reciprocal Rank — 1/(posição do primeiro trecho relevante); maior é melhor. |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | golden set loads, schema valid, sources exist | `backend/tests/test_retrieval_metrics.py` |
| AC2 | P@k / Recall@k / MRR exact on hand-built rankings | `backend/tests/test_retrieval_metrics.py` |
| AC3 | labelled query → `eval` present; unlabelled → absent | `backend/tests/test_retrieval_metrics.py` (`@openai` for the live run) |
| AC4 | unlabelled run byte-for-byte (`rag.retrieve` keys unchanged) | `backend/tests/test_retrieval_metrics.py` |
| AC5 | rerank-on MRR ≥ rerank-off for a chosen benchmark | `backend/tests/test_retrieval_metrics.py` (`@openai`) |
| AC6 | `/api/config` includes `benchmark_queries` | `backend/tests/test_api.py` (extend) |
| AC7 | drill-in renders metrics + no-ground-truth path | `frontend/src/components/RagStageDetail.metrics.test.tsx` |
| AC8 | `deriveRagPipeline` carries `eval` into retrieval stage | `frontend/src/lib/ragPipeline.metrics.test.ts` |
| AC9 | i18n parity for new keys | existing strings parity test |

## Risks / trade-offs

- **Query-string matching is brittle** if a user paraphrases — mitigated by the benchmark chips
  (exact strings). Acceptable: metrics are a *teaching* aid, not a runtime gate.
- **Model variability** — AC5 asserts `≥`, not an exact float; the golden set picks a query whose
  relevant chunk is reliably *not* dense-rank-1 so reranking has room to help.
- **Corpus drift** — if a corpus file is renamed, AC1 fails loudly (a feature: the golden set stays
  honest). Keep `relevant_sources` in sync when editing the corpus.
- Single-instance/§7 unaffected — pure read-side computation, no shared state.
