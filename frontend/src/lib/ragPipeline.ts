// 054-rag-block-expansion (RAG block redesign) — the pure projection behind the
// anchored RAG-pipeline panel. `deriveRagPipeline` turns the event log up to the
// cursor into the ordered query-time RAG stages and each one's live status, so the
// panel just renders descriptors (no logic) and live streaming / step-replay share
// the exact same code path as the rest of the canvas (a smaller cursor = replay).
//
// The query-time pipeline is Embedding → Retrieval → Rerank → Augmented; Chunking
// is the OFFLINE precursor (built at ingestion), shown muted so it's honest — there
// is no query-time chunking event. "Augmented" is the "A" in RAG: the retrieved
// chunks assembled into the prompt context handed to the LLM (from `llm.prompt`).

import type { ContextBudget, Stage, TraceEvent } from "../types/events";

export type RagStageId =
  | "chunking"
  | "embedding"
  | "retrieval"
  | "hybrid"
  | "rerank"
  | "augmented";

// offline  — the ingestion-time precursor (chunking), never a live query stage
// inactive — exists on a higher rung only (rerank on the Simple rung)
// pending  — part of this run but not reached yet
// active   — firing right now (the cursor is on one of its events)
// done     — completed (its END event has passed)
export type RagStageStatus = "offline" | "inactive" | "pending" | "active" | "done";

export interface RagStage {
  id: RagStageId;
  status: RagStageStatus;
  data: Record<string, unknown>;
}

export interface RagPipeline {
  stages: RagStage[];
  /** True once retrieval has actually run this turn (the panel has something live). */
  started: boolean;
}

export const RAG_STAGE_ORDER: RagStageId[] = [
  "chunking",
  "embedding",
  "retrieval",
  "hybrid",
  "rerank",
  "augmented",
];

// A retrieved/ranked chunk as the detail views consume it (mirror of the backend
// chunk dict). All optional so a partial/legacy trace still renders.
export interface PipelineChunk {
  source: string;
  text: string;
  score: number;
  // null for a fused BM25-only chunk (no cosine similarity) — 070-hybrid-search.
  similarity?: number | null;
  distance?: number;
  rank?: number;
}

/**
 * The cosine angle (degrees) between the query and a chunk, from its similarity
 * (cosine = 1 − distance). Used to place each retrieved chunk around the query
 * vector in the Retrieval illustration: identical direction → 0°, orthogonal → 90°.
 * Clamped so a tiny floating-point overshoot can't produce NaN.
 */
export function cosineAngleDeg(similarity: number): number {
  const c = Math.max(-1, Math.min(1, similarity));
  return (Math.acos(c) * 180) / Math.PI;
}

// The query that was embedded/searched: the model's `search_knowledge_base` tool
// argument when present (the honest, exact query), else the user's message.
function retrievalQuery(visible: TraceEvent[]): string {
  // 069 — prefer the query carried on the retrieve END: the backend tags each
  // search's retrieve with its own query, so in a per-cycle slice this attributes
  // the right query to the right retrieval (the tool-call fallback would otherwise
  // resolve to the *last* search_knowledge_base call across the whole turn).
  for (let i = visible.length - 1; i >= 0; i--) {
    const e = visible[i];
    if (e.stage === "rag.retrieve" && e.phase === "end" && typeof e.data.query === "string") {
      if (e.data.query) return e.data.query;
    }
  }
  for (let i = visible.length - 1; i >= 0; i--) {
    const calls = visible[i].data.tool_calls as
      | Array<{ name?: string; args?: { query?: string } }>
      | undefined;
    const hit = calls?.find((c) => c.name === "search_knowledge_base" && c.args?.query);
    if (hit?.args?.query) return hit.args.query;
  }
  const msg = visible.find((e) => e.stage === "frontend" && typeof e.data.message === "string");
  return (msg?.data.message as string) ?? "";
}

export function deriveRagPipeline(events: TraceEvent[], cursor: number): RagPipeline {
  const visible = cursor >= 0 ? events.slice(0, cursor + 1) : [];

  const lastEnd = (stage: Stage): TraceEvent | undefined => {
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].stage === stage && visible[i].phase === "end") return visible[i];
    }
    return undefined;
  };
  const present = (stage: Stage): boolean => visible.some((e) => e.stage === stage);

  // A stage is `active` while it is mid-flight (an event has appeared but its END
  // hasn't yet), `done` once its END has passed, `pending` before it starts. So the
  // glow follows the live cursor naturally and a settled run reads all-done.
  const status = (stages: Stage[]): RagStageStatus => {
    if (stages.some((s) => lastEnd(s))) return "done";
    if (stages.some((s) => present(s))) return "active";
    return "pending";
  };

  // 1 — Chunking: offline (ingestion). If THIS turn carried an upload, surface the
  // real chunk count; otherwise it's the muted "built offline" precursor.
  const ingestChunk = lastEnd("rag.ingest.chunk");
  const chunking: RagStage = {
    id: "chunking",
    status: ingestChunk ? status(["rag.ingest.chunk"]) : "offline",
    data: ingestChunk ? { num_chunks: ingestChunk.data.num_chunks } : {},
  };

  const query = retrievalQuery(visible);

  // 2 — Embedding the query.
  const embed = lastEnd("rag.embed");
  const embedding: RagStage = {
    id: "embedding",
    status: status(["rag.embed"]),
    data: embed
      ? { model: embed.data.model, dim: embed.data.dim, preview: embed.data.preview, query }
      : { query },
  };

  // 3 — Retrieval (vector search). Shows the FULL candidate pool the search found
  // (fetch_k wide on Intermediate); the reranker then trims to top-k. `kept` is how
  // many survive into the prompt, so the UI can say "10 candidates · top 4 kept".
  const search = lastEnd("rag.search");
  const retrieve = lastEnd("rag.retrieve");
  const retrieved = (retrieve?.data.chunks as PipelineChunk[]) ?? [];
  // Prefer the wider candidate pool from rag.search; fall back to the retrieved
  // (kept) chunks so the plot/list never go blank if the pool isn't present.
  const pool = (search?.data.chunks as PipelineChunk[]) ?? retrieved;
  const kept = retrieved.length || pool.length;
  const retrieval: RagStage = {
    id: "retrieval",
    status: status(["rag.search", "rag.retrieve"]),
    data: {
      metric: search?.data.metric,
      k: search?.data.k,
      candidates: search?.data.candidates ?? pool.length,
      count: pool.length,
      kept,
      chunks: pool,
      query,
      top: pool[0] ? { source: pool[0].source, score: pool[0].score } : undefined,
    },
  };

  // 4 — Hybrid (070-hybrid-search): inactive unless the run fused a BM25 lane with the
  // vector lane (RRF). `movement` carries each fused chunk's vector_rank / bm25_rank /
  // rrf_score for the Vector | BM25 | → RRF view. Like rerank, a pure projection of the
  // trace: a hybrid run emits rag.hybrid *somewhere*, so the full log decides inactive vs
  // pending; status resolves pending/active/done at the cursor.
  const hybrid = lastEnd("rag.hybrid");
  const hybridMovement =
    (hybrid?.data.candidates as Array<{ new_rank: number }> | undefined) ?? [];
  const runHasHybrid = events.some((e) => e.stage === "rag.hybrid");
  const hybridStage: RagStage = {
    id: "hybrid",
    status: runHasHybrid ? status(["rag.hybrid"]) : "inactive",
    data: hybrid
      ? {
          rrf_k: hybrid.data.rrf_k,
          bm25_k: hybrid.data.bm25_k,
          vectorCandidates: hybrid.data.vector_candidates,
          bm25Candidates: hybrid.data.bm25_candidates,
          fused: hybrid.data.fused,
          movement: hybridMovement,
        }
      : {},
  };

  // 5 — Rerank: inactive on the Simple rung (it's an Intermediate upgrade); else
  // its live status. `movement` exposes the rank reordering.
  const rerank = lastEnd("rag.rerank");
  const movement = (rerank?.data.candidates as Array<{ new_rank: number }>) ?? [];
  // 061-scenario-builder — the rerank card is a pure projection of the trace now: a run
  // that reranks emits rag.rerank *somewhere* in its log, so we look at the FULL events
  // (not just up to the cursor) to tell "rerank off" (inactive) from "not reached yet"
  // (pending). When the run does rerank, `status` resolves pending/active/done at the cursor.
  const runHasRerank = events.some((e) => e.stage === "rag.rerank");
  const rerankStage: RagStage = {
    id: "rerank",
    status: runHasRerank ? status(["rag.rerank"]) : "inactive",
    data: rerank
      ? {
          model: rerank.data.model,
          k: rerank.data.k,
          fetch_k: rerank.data.fetch_k,
          // 055 — the min-score threshold; a kept chunk below it is dropped.
          threshold: rerank.data.threshold,
          movement,
        }
      : {},
  };

  // 5 — Augmented: the retrieved context assembled into the prompt sent to the LLM
  // (the "A" in RAG), read from the llm.prompt budget's `retrieved` slice.
  const prompt = lastEnd("llm.prompt");
  const budget = prompt?.data.context_budget as ContextBudget | undefined;
  const augmented: RagStage = {
    id: "augmented",
    status: status(["llm.prompt"]),
    data: prompt
      ? {
          retrievedTokens: budget?.retrieved,
          context: prompt.data.context,
          window: prompt.data.context_window,
        }
      : {},
  };

  const started = present("rag.embed") || present("rag.search") || present("rag.retrieve");

  return {
    stages: [chunking, embedding, retrieval, hybridStage, rerankStage, augmented],
    started,
  };
}

// 069-rag-executions-history — the agent can elect `search_knowledge_base` more than
// once in a turn; each call runs its own embed → search → [rerank] → retrieve cycle.
// `deriveRagPipeline` reads each stage with `lastEnd`, so it only shows the LAST cycle.
// This splits the turn into one RagPipeline per cycle so the drill-in can navigate them.
const CYCLE_STAGES: Stage[] = [
  "rag.embed",
  "rag.search",
  // 070-hybrid-search — the fusion sub-stage is per-cycle too, so it's attributed to
  // the search that produced it (not treated as a global event).
  "rag.hybrid",
  "rag.rerank",
  "rag.retrieve",
];

export function deriveRagExecutions(events: TraceEvent[], cursor: number): RagPipeline[] {
  const visible = cursor >= 0 ? events.slice(0, cursor + 1) : [];
  // Each query cycle begins by embedding the query. Ingestion embeds via the distinct
  // `rag.ingest.embed` stage and RAGLESS never emits `rag.*`, so this marker is
  // unambiguous for vector retrieval.
  const starts = visible
    .filter((e) => e.stage === "rag.embed" && e.phase === "start")
    .map((e) => e.seq);
  if (starts.length === 0) return [];
  // One (or zero) cycle → today's exact result (keeps the single-cycle path byte-for-byte).
  if (starts.length === 1) return [deriveRagPipeline(events, cursor)];

  const isCycle = (s: Stage): boolean => CYCLE_STAGES.includes(s);
  return starts.map((startSeq, i) => {
    const nextSeq = i + 1 < starts.length ? starts[i + 1] : Infinity;
    // Keep every non-cycle event (ingestion / llm.prompt / thinks stay global) plus
    // only THIS cycle's retrieval-stage events, then reuse the base projection so each
    // cycle renders identically to a single-search turn.
    const slice = visible.filter(
      (e) => !isCycle(e.stage) || (e.seq >= startSeq && e.seq < nextSeq),
    );
    return deriveRagPipeline(slice, slice.length - 1);
  });
}
