// 073-metadata-first-class (AC2) — chunk metadata (section/doc_type/position) flows from the
// rag.search/retrieve events through deriveRagPipeline onto each PipelineChunk (pure projection).
import { describe, expect, it } from "vitest";

import { deriveRagPipeline } from "./ragPipeline";
import type { TraceEvent } from "../types/events";

function ev(partial: Partial<TraceEvent> & { stage: string; seq: number }): TraceEvent {
  return { trace_id: "t", phase: "end", ts: 0, label: "", data: {}, metrics: {}, ...partial } as TraceEvent;
}

describe("deriveRagPipeline carries chunk metadata (073)", () => {
  it("exposes section/doc_type/position on retrieval-stage chunks", () => {
    const chunk = {
      source: "embeddings.md",
      text: "cosine…",
      score: 0.7,
      section: "Vector Search",
      doc_type: "markdown",
      position: "3/5",
    };
    const events: TraceEvent[] = [
      ev({ stage: "rag.embed", seq: 1, data: { model: "m", dim: 3 } }),
      ev({ stage: "rag.search", seq: 2, data: { metric: "cosine", k: 4, candidates: 1, chunks: [chunk] } }),
      ev({ stage: "rag.retrieve", seq: 3, data: { chunks: [chunk], k: 4 } }),
    ];
    const pipeline = deriveRagPipeline(events, events.length - 1);
    const retrieval = pipeline.stages.find((s) => s.id === "retrieval")!;
    const out = (retrieval.data.chunks as (typeof chunk)[])[0];
    expect(out.section).toBe("Vector Search");
    expect(out.doc_type).toBe("markdown");
    expect(out.position).toBe("3/5");
  });
});
