// 002-interactive-chat — the three PDF-ingestion stages must map to the `rag`
// station (constitution §6) and flow through the pure projection without
// breaking it (an unmapped stage would crash deriveView).

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveView } from "./derive";
import { STAGE_TO_STATION } from "./stations";

const INGEST: Stage[] = ["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"];

function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: 0, ts: 0, stage, phase, label: "", data, metrics: {} };
}

describe("ingestion stages", () => {
  it("each map to the rag station", () => {
    for (const stage of INGEST) expect(STAGE_TO_STATION[stage]).toBe("rag");
  });

  it("light the rag station through the projection", () => {
    const events: TraceEvent[] = [
      ev("frontend", "end", { filename: "a.pdf" }),
      ev("backend", "start"),
      ev("rag.ingest.chunk", "start"),
      ev("rag.ingest.chunk", "end", { num_chunks: 2 }),
      ev("rag.ingest.embed", "start"),
      ev("rag.ingest.embed", "end", { num_vectors: 2 }),
      ev("rag.ingest.store", "start"),
      ev("rag.ingest.store", "end", { chunks_stored: 2 }),
    ];
    const view = deriveView(events, events.length - 1);
    expect(view.stations.rag.status).toBe("done");
    // The six rag.ingest events all land on the rag station.
    expect(view.stations.rag.events).toHaveLength(6);
    expect(view.activeStation).toBe("rag");
  });
});
