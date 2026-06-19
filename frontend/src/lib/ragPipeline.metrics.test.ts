// 071-retrieval-metrics (AC8) — the `eval` scorecard on the rag.retrieve END flows through
// deriveRagPipeline into the Retrieval stage data (pure projection; live + replay share it).
import { describe, expect, it } from "vitest";

import { deriveRagPipeline } from "./ragPipeline";
import type { TraceEvent } from "../types/events";

function ev(partial: Partial<TraceEvent> & { stage: string; seq: number }): TraceEvent {
  return { trace_id: "t", phase: "end", ts: 0, label: "", data: {}, metrics: {}, ...partial } as TraceEvent;
}

describe("deriveRagPipeline carries retrieval eval (071)", () => {
  const evalPayload = {
    precision_at_k: 0.5,
    recall_at_k: 1.0,
    mrr: 1.0,
    k: 4,
    relevant_count: 1,
    relevant_sources: ["embeddings.md"],
    missed: [],
  };

  it("exposes eval on the retrieval stage when present", () => {
    const events: TraceEvent[] = [
      ev({ stage: "rag.embed", seq: 1, data: { model: "m", dim: 3 } }),
      ev({ stage: "rag.search", seq: 2, data: { metric: "cosine", k: 4, candidates: 2, chunks: [] } }),
      ev({
        stage: "rag.retrieve",
        seq: 3,
        data: { chunks: [{ source: "embeddings.md", text: "x", score: 0.7 }], k: 4, eval: evalPayload },
      }),
    ];
    const pipeline = deriveRagPipeline(events, events.length - 1);
    const retrieval = pipeline.stages.find((s) => s.id === "retrieval")!;
    expect(retrieval.data.eval).toEqual(evalPayload);
  });

  it("leaves eval undefined for an unlabelled run", () => {
    const events: TraceEvent[] = [
      ev({ stage: "rag.embed", seq: 1, data: { model: "m", dim: 3 } }),
      ev({ stage: "rag.search", seq: 2, data: { metric: "cosine", k: 4, candidates: 2, chunks: [] } }),
      ev({ stage: "rag.retrieve", seq: 3, data: { chunks: [], k: 4 } }),
    ];
    const pipeline = deriveRagPipeline(events, events.length - 1);
    const retrieval = pipeline.stages.find((s) => s.id === "retrieval")!;
    expect(retrieval.data.eval).toBeUndefined();
  });
});
