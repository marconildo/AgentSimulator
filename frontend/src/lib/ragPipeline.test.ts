// 054-rag-block-expansion (RAG block redesign) — the pure pipeline projection.
// Structural assertions on stage order + live status so the panel stays a pure
// projection (live + step-replay share this code path).

import { describe, expect, it } from "vitest";

import { RAG_STAGE_ORDER, cosineAngleDeg, deriveRagPipeline } from "./ragPipeline";
import type { Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: "start" | "end", data: Record<string, unknown> = {}): TraceEvent {
  seq += 1;
  return { trace_id: "t", seq, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function log(): TraceEvent[] {
  seq = 0;
  return [
    ev("rag.embed", "start"),
    ev("rag.embed", "end", { model: "text-embedding-3-small", dim: 1536 }),
    ev("rag.search", "start"),
    ev("rag.search", "end", {
      metric: "cosine",
      k: 10,
      candidates: 10,
      // The wider candidate pool the vector search found (rerank trims it to top-k).
      chunks: [
        { source: "rag.md", score: 0.88, similarity: 0.88 },
        { source: "agents.md", score: 0.41, similarity: 0.41 },
      ],
    }),
    ev("rag.rerank", "start"),
    ev("rag.rerank", "end", {
      model: "ms-marco-MiniLM-L-12-v2",
      k: 4,
      fetch_k: 10,
      candidates: [{ new_rank: 1, prev_rank: 3, score: 0.9 }],
    }),
    ev("rag.retrieve", "start"),
    ev("rag.retrieve", "end", { k: 4, chunks: [{ source: "rag.md", score: 0.88 }] }),
    ev("llm.prompt", "end", { context: "[rag.md] …", context_budget: { retrieved: 320 } }),
  ];
}

const byId = (p: ReturnType<typeof deriveRagPipeline>) =>
  Object.fromEntries(p.stages.map((s) => [s.id, s]));

describe("deriveRagPipeline (054)", () => {
  it("returns the five stages in canonical order", () => {
    const p = deriveRagPipeline(log(), 8);
    expect(p.stages.map((s) => s.id)).toEqual(RAG_STAGE_ORDER);
  });

  it("chunking is always the offline precursor on a plain query (no upload)", () => {
    const p = deriveRagPipeline(log(), 8);
    expect(byId(p).chunking.status).toBe("offline");
  });

  it("marks each stage done once its END has passed (full intermediate run)", () => {
    const p = deriveRagPipeline(log(), 8);
    const s = byId(p);
    expect(s.embedding.status).toBe("done");
    expect(s.retrieval.status).toBe("done");
    expect(s.rerank.status).toBe("done");
    expect(s.augmented.status).toBe("done");
    expect(s.rerank.data.fetch_k).toBe(10);
    expect(Array.isArray(s.rerank.data.movement)).toBe(true);
    expect(s.augmented.data.retrievedTokens).toBe(320);
  });

  it("lights the stage at the cursor as active and leaves later ones pending", () => {
    const events = log();
    // Cursor on the rag.search START (index 2) → retrieval active, rerank/augmented pending.
    const p = deriveRagPipeline(events, 2);
    const s = byId(p);
    expect(s.embedding.status).toBe("done");
    expect(s.retrieval.status).toBe("active");
    expect(s.rerank.status).toBe("pending");
    expect(s.augmented.status).toBe("pending");
  });

  it("carries the rerank score threshold onto the rerank stage (055)", () => {
    const events = log().map((e) =>
      e.stage === "rag.rerank" && e.phase === "end"
        ? { ...e, data: { ...e.data, threshold: 0.3 } }
        : e,
    );
    const p = deriveRagPipeline(events, events.length - 1);
    expect(byId(p).rerank.data.threshold).toBe(0.3);
  });

  it("shows rerank as inactive when the run carried no rerank pass", () => {
    // A run without rerank never emits rag.rerank (061 — pure projection of the trace).
    const simple = log().filter((e) => e.stage !== "rag.rerank");
    const p = deriveRagPipeline(simple, simple.length - 1);
    expect(byId(p).rerank.status).toBe("inactive");
    // The rest of the pipeline still completes.
    expect(byId(p).retrieval.status).toBe("done");
    expect(byId(p).augmented.status).toBe("done");
  });

  it("is not started before any retrieval event has fired", () => {
    expect(deriveRagPipeline([], -1).started).toBe(false);
    expect(deriveRagPipeline(log(), 8).started).toBe(true);
  });

  it("carries the real per-stage detail data (query, chunks, context)", () => {
    const events = [
      { ...ev("frontend", "end", { message: "why does chunk size matter?" }) },
      ...log(),
    ];
    const p = deriveRagPipeline(events, events.length - 1);
    const s = byId(p);
    expect(s.embedding.data.query).toBe("why does chunk size matter?");
    // Retrieval shows the full candidate POOL (from rag.search), not the trimmed set.
    expect(Array.isArray(s.retrieval.data.chunks)).toBe(true);
    expect((s.retrieval.data.chunks as unknown[]).length).toBe(2);
    // `kept` is how many survive the rerank into the prompt (rag.retrieve count).
    expect(s.retrieval.data.kept).toBe(1);
    expect(s.augmented.data.context).toContain("rag.md");
  });

  it("prefers the search_knowledge_base tool-call query over the user message", () => {
    const events = [
      ev("frontend", "end", { message: "the raw user message" }),
      ev("agent.think", "end", {
        tool_calls: [{ name: "search_knowledge_base", args: { query: "rephrased query" } }],
      }),
      ...log(),
    ];
    const p = deriveRagPipeline(events, events.length - 1);
    expect(byId(p).embedding.data.query).toBe("rephrased query");
  });
});

// 070-hybrid-search — the BM25 + vector RRF fusion sub-stage (AC7).
describe("deriveRagPipeline hybrid (070)", () => {
  // A run that fuses: rag.hybrid fires between search and rerank, carrying the per-
  // candidate fusion (vector_rank / bm25_rank / rrf_score).
  function hybridLog(): TraceEvent[] {
    seq = 0;
    return [
      ev("rag.embed", "end", { model: "text-embedding-3-small", dim: 1536 }),
      ev("rag.search", "end", { metric: "cosine", k: 10, candidates: 10, chunks: [] }),
      ev("rag.hybrid", "start"),
      ev("rag.hybrid", "end", {
        rrf_k: 60,
        bm25_k: 10,
        vector_candidates: 10,
        bm25_candidates: 8,
        fused: 12,
        candidates: [
          { source: "embeddings.md", vector_rank: 5, bm25_rank: 1, rrf_score: 0.0318, new_rank: 1 },
          { source: "rag.md", vector_rank: 1, bm25_rank: null, rrf_score: 0.0164, new_rank: 2 },
        ],
      }),
      ev("rag.retrieve", "end", { k: 4, chunks: [{ source: "embeddings.md", score: 0.5 }] }),
      ev("llm.prompt", "end", { context: "[embeddings.md] …", context_budget: { retrieved: 200 } }),
    ];
  }

  it("hybrid is inactive when the run carried no fusion pass", () => {
    // Today's single-search run never emits rag.hybrid (byte-for-byte; pure projection).
    const p = deriveRagPipeline(log(), 8);
    expect(byId(p).hybrid.status).toBe("inactive");
    // The rest of the pipeline is unaffected.
    expect(byId(p).retrieval.status).toBe("done");
  });

  it("surfaces the fusion (rrf_k, lane sizes, movement) when hybrid fired", () => {
    const events = hybridLog();
    const p = deriveRagPipeline(events, events.length - 1);
    const h = byId(p).hybrid;
    expect(h.status).toBe("done");
    expect(h.data.rrf_k).toBe(60);
    expect(h.data.vectorCandidates).toBe(10);
    expect(h.data.bm25Candidates).toBe(8);
    expect(h.data.fused).toBe(12);
    const movement = h.data.movement as Array<{ new_rank: number; bm25_rank: number | null }>;
    expect(movement).toHaveLength(2);
    // The exact-token chunk BM25 ranked #1 leads the fused order.
    expect(movement[0].bm25_rank).toBe(1);
    expect(movement[0].new_rank).toBe(1);
  });

  it("orders hybrid between retrieval and rerank in the pipeline", () => {
    const order = RAG_STAGE_ORDER;
    expect(order.indexOf("hybrid")).toBeGreaterThan(order.indexOf("retrieval"));
    expect(order.indexOf("hybrid")).toBeLessThan(order.indexOf("rerank"));
  });
});

describe("cosineAngleDeg (054)", () => {
  it("maps cosine similarity to the angle between the vectors", () => {
    expect(cosineAngleDeg(1)).toBeCloseTo(0); // identical direction
    expect(cosineAngleDeg(0)).toBeCloseTo(90); // orthogonal
    expect(Math.round(cosineAngleDeg(0.5))).toBe(60);
  });

  it("clamps out-of-range similarity so it never returns NaN", () => {
    expect(Number.isNaN(cosineAngleDeg(1.0001))).toBe(false);
    expect(cosineAngleDeg(1.0001)).toBeCloseTo(0);
  });
});
