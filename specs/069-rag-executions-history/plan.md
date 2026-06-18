# Plan: RAG executions history

> HOW. Pure projection (§3 — every cycle shown is a real retrieval from the trace), one
> source of truth for the visual model (§6 — no new station, the existing `rag` drill-in
> grows a selector), bilingual (§4), single source of truth for derivation (a tested
> pure helper that reuses `deriveRagPipeline`).

## Approach

Each `search_knowledge_base` call emits its own `rag.embed → rag.search → [rag.rerank] →
rag.retrieve` cycle, all already in the trace. The panel shows only the last because
`deriveRagPipeline` reads each stage with `lastEnd`. So, exactly like 068, this is a
derivation/navigation gap.

1. Add a **pure wrapper** `deriveRagExecutions(events, cursor): RagPipeline[]` in
   `frontend/src/lib/ragPipeline.ts` that:
   - Computes the same visible slice (`events.slice(0, cursor+1)`).
   - Finds cycle boundaries by the **`rag.embed` START** events (one per query
     embedding; ingestion uses the distinct `rag.ingest.embed` stage, so query cycles are
     cleanly separable). 0 boundaries → `[]`; 1 → `[deriveRagPipeline(events, cursor)]`
     (today's exact result).
   - For N ≥ 2, for each cycle k build a **filtered event list** = every event that is
     *not* a retrieval-cycle stage (so ingestion/`llm.prompt`/everything stays global)
     **plus** the cycle stages (`rag.embed`/`search`/`rerank`/`retrieve`) whose `seq`
     falls in `[startₖ, startₖ₊₁)`, then call the existing `deriveRagPipeline(filtered,
     filtered.length - 1)`. Reuse keeps each cycle's rendering identical to today's.
   This isolates the partitioning so it is unit-testable without React (AC1–AC3).

2. Wire the **navigator** into `frontend/src/components/RagPipelinePanel.tsx`:
   - Replace `const pipeline = deriveRagPipeline(...)` with `executions =
     deriveRagExecutions(events, cursor)`; keep a local `execIndex` state, default to the
     last execution, clamped when the count changes (an effect, like 050/068 patterns).
   - `pipeline = executions[execIndex] ?? deriveRagPipeline(events, cursor)` (fallback
     keeps the single/zero case unchanged).
   - Render a compact `‹ k / N ›` stepper in the header **only when
     `executions.length ≥ 2`**, labelled with cycle k's query (from the embedding stage's
     `data.query`, truncated). Reset `picked` stage on switch so the new cycle opens on
     its active stage.

3. **i18n**: a small `ragDetail.executions` group (label + a `k / N` formatter +
   prev/next aria labels), en + pt.

### Alternatives considered
- *Re-derive everything inside the panel by hand* — rejected; reusing `deriveRagPipeline`
  on a filtered slice guarantees each cycle renders byte-for-byte like today.
- *A new backend per-cycle aggregate event* — unnecessary; the cycles are already streamed
  (would violate §1/§3, "don't add protocol you don't need").

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/ragPipeline.ts` — **new** `deriveRagExecutions` (+ reuse `deriveRagPipeline`).
- `frontend/src/lib/ragPipeline.executions.test.ts` — **new** unit tests (AC1–AC3, AC5).
- `frontend/src/components/RagPipelinePanel.tsx` — execution state + header navigator (AC4).
- `frontend/src/components/RagPipelinePanel.executions.test.tsx` — render test (AC4) [if jsdom-feasible; else assert via the lib + a thin DOM smoke].
- `frontend/src/i18n/strings.ts` — `ragDetail.executions*` strings (en + pt) + type.

## Protocol changes (constitution §1)

- none. No `schemas.py` / `events.ts` change. `STAGE_TO_STATION` / `STAGE_TO_PHASE` unchanged.

## Data model changes

- none.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `ragDetail.execution` | retrieval | recuperação |
| `ragDetail.executionOf` (k,n) | retrieval {k} / {n} | recuperação {k} / {n} |
| `ragDetail.prevExecution` | Previous retrieval | Recuperação anterior |
| `ragDetail.nextExecution` | Next retrieval | Próxima recuperação |

(The per-cycle query is the real query text, not translatable prose.)

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | two cycles → 2 pipelines, distinct query + top chunk | `ragPipeline.executions.test.ts` |
| AC2 | one cycle → `[deriveRagPipeline(...)]`; zero → `[]` | `ragPipeline.executions.test.ts` |
| AC3 | partial second cycle → 2 entries, 2nd embedding active / retrieval pending | `ragPipeline.executions.test.ts` |
| AC5 | execution k carries cycle k's retrieval `top`/candidates | `ragPipeline.executions.test.ts` |
| AC4 | navigator shows only when N≥2, reports k/N, bounded | `RagPipelinePanel.executions.test.tsx` (jsdom) |
| AC6 | en & pt both define every new key | enforced structurally by `tsc` (both impls satisfy the `Strings` interface) |

## Risks / trade-offs

- **Boundary detection** assumes each query cycle begins with `rag.embed` START. Ingestion
  embeds via a different stage (`rag.ingest.embed`), and RAGLESS never emits `rag.*`, so
  the marker is unambiguous for vector retrieval. Low risk.
- **Augmented stage** stays turn-level (one final prompt) — intentional (non-goal), so all
  executions show the same augmented context; the cycle-specific data is in the
  Embedding/Retrieval/Rerank cards.
- Additive, no protocol, no backend; the N≤1 fallback keeps every existing RAG test green.
