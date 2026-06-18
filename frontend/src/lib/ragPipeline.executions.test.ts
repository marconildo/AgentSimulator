// 069-rag-executions-history — `deriveRagExecutions(events, cursor)` splits a turn's
// event log into ONE RagPipeline per retrieval cycle (each `search_knowledge_base` call
// runs embed → search → [rerank] → retrieve), so the RAG drill-in can navigate every
// retrieval — not just the last one `lastEnd` surfaces. Pure projection; reuses
// `deriveRagPipeline` per cycle, so each renders exactly like today.

import { describe, expect, it } from "vitest";

import { deriveRagExecutions, deriveRagPipeline } from "./ragPipeline";
import type { Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: "start" | "end", data: Record<string, unknown> = {}): TraceEvent {
  seq += 1;
  return { trace_id: "t", seq, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// One retrieval cycle for `query`, retrieving `topSource` as its best chunk.
function cycle(query: string, topSource: string, topScore: number): TraceEvent[] {
  return [
    ev("rag.embed", "start"),
    ev("rag.embed", "end", { model: "text-embedding-3-small", dim: 1536 }),
    ev("rag.search", "start"),
    ev("rag.search", "end", {
      metric: "cosine",
      k: 4,
      candidates: 4,
      chunks: [{ source: topSource, score: topScore, similarity: topScore }],
    }),
    ev("rag.retrieve", "start"),
    ev("rag.retrieve", "end", { k: 4, query, chunks: [{ source: topSource, score: topScore }] }),
  ];
}

const byId = (p: ReturnType<typeof deriveRagPipeline>) =>
  Object.fromEntries(p.stages.map((s) => [s.id, s]));

describe("deriveRagExecutions (069)", () => {
  it("splits two search cycles into 2 pipelines with distinct query + top chunk (AC1)", () => {
    seq = 0;
    const events = [
      ev("frontend", "start", { message: "What is RAG and how does retrieval work?" }),
      ...cycle("definition of RAG", "rag.md", 0.8),
      ...cycle("how retrieval works", "agents.md", 0.7),
      ev("llm.prompt", "end", { context: "…", context_budget: { retrieved: 320 } }),
    ];
    const execs = deriveRagExecutions(events, events.length - 1);
    expect(execs).toHaveLength(2);
    expect(byId(execs[0]).embedding.data.query).toBe("definition of RAG");
    expect(byId(execs[1]).embedding.data.query).toBe("how retrieval works");
    expect((byId(execs[0]).retrieval.data.top as { source: string }).source).toBe("rag.md");
    expect((byId(execs[1]).retrieval.data.top as { source: string }).source).toBe("agents.md");
  });

  it("one cycle == deriveRagPipeline; zero cycles == [] (AC2)", () => {
    seq = 0;
    const one = [...cycle("just one", "rag.md", 0.9)];
    const execs = deriveRagExecutions(one, one.length - 1);
    expect(execs).toHaveLength(1);
    expect(execs[0]).toEqual(deriveRagPipeline(one, one.length - 1));

    seq = 0;
    const none = [ev("frontend", "start", { message: "hi" }), ev("llm.prompt", "end", {})];
    expect(deriveRagExecutions(none, none.length - 1)).toEqual([]);
  });

  it("surfaces a partial second cycle (embedding active, retrieval pending) (AC3)", () => {
    seq = 0;
    const events = [
      ...cycle("first query", "rag.md", 0.8),
      // second cycle has only started embedding — no retrieve yet
      ev("rag.embed", "start"),
    ];
    const execs = deriveRagExecutions(events, events.length - 1);
    expect(execs).toHaveLength(2);
    expect(byId(execs[1]).embedding.status).toBe("active");
    expect(byId(execs[1]).retrieval.status).toBe("pending");
  });

  it("execution k carries cycle k's retrieval data, not the last (AC5)", () => {
    seq = 0;
    const events = [
      ...cycle("q1", "rag.md", 0.81),
      ...cycle("q2", "agents.md", 0.42),
    ];
    const execs = deriveRagExecutions(events, events.length - 1);
    expect((byId(execs[0]).retrieval.data.top as { score: number }).score).toBeCloseTo(0.81);
    expect((byId(execs[1]).retrieval.data.top as { score: number }).score).toBeCloseTo(0.42);
  });
});
