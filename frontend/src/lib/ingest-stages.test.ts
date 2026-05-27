// 033-ingestion-node — the three PDF-ingestion stages are owned by the new
// `ingestion` station (re-mapped off `rag`, constitution §6), and flow through
// the pure projection without breaking it. The query-time RAG node keeps only
// embed/search/retrieve. (Updated from 002, which mapped ingest → rag.)

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveView } from "./derive";
import { STAGE_TO_STATION } from "./stations";

const INGEST: Stage[] = ["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"];

function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: 0, ts: 0, stage, phase, label: "", data, metrics: {} };
}

describe("ingestion stages (033-ingestion-node)", () => {
  it("each map to the ingestion station, not rag (AC2)", () => {
    for (const stage of INGEST) expect(STAGE_TO_STATION[stage]).toBe("ingestion");
  });

  it("the rag station owns only the query-time stages (AC2)", () => {
    expect(STAGE_TO_STATION["rag.embed"]).toBe("rag");
    expect(STAGE_TO_STATION["rag.search"]).toBe("rag");
    expect(STAGE_TO_STATION["rag.retrieve"]).toBe("rag");
  });

  it("light the ingestion station through the projection (AC3)", () => {
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
    expect(view.stations.ingestion.status).toBe("done");
    // The six rag.ingest events all land on the ingestion station.
    expect(view.stations.ingestion.events).toHaveLength(6);
    expect(view.activeStation).toBe("ingestion");
    // …and none of them light the query-time rag node.
    expect(view.stations.rag.events).toHaveLength(0);
  });
});
