// 034-storage-ingestion-flow + 080-ingestion-pipeline-merge — the upload write-path
// (Frontend → Backend → Ingestion → Vector DB). 080 folded the old standalone Object
// Storage node into the `ingestion` station: `storage.upload` is now its first phase
// (the durable object write), so it maps to `ingestion` and lights that single node.
// A normal chat never emits it, so ingestion stays idle.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveView } from "./derive";
import { STAGE_TO_STATION } from "./stations";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function uploadRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { filename: "a.pdf" }),
    ev("backend", "start"),
    ev("storage.upload", "start", { filename: "a.pdf" }),
    ev("storage.upload", "end", {
      key: "s/d/a.pdf",
      size_bytes: 1234,
      content_type: "application/pdf",
    }),
    ev("rag.ingest.chunk", "end", { num_chunks: 2, strategy: "recursive" }),
    ev("rag.ingest.tokenize", "end", { token_counts: [10, 12], total_tokens: 22 }),
    ev("rag.ingest.embed", "end", { num_vectors: 2 }),
    ev("rag.ingest.metadata", "end", { num_records: 2 }),
    ev("rag.ingest.store", "end", { chunks_stored: 2 }),
    ev("backend", "end", {}),
  ];
}

describe("storage.upload projection (080-ingestion-pipeline-merge)", () => {
  it("maps storage.upload to the merged ingestion station (AC5/AC6)", () => {
    expect(STAGE_TO_STATION["storage.upload"]).toBe("ingestion");
  });

  it("every ingest stage maps to the ingestion station (AC5)", () => {
    for (const s of [
      "rag.ingest.chunk",
      "rag.ingest.tokenize",
      "rag.ingest.embed",
      "rag.ingest.metadata",
      "rag.ingest.store",
    ] as const) {
      expect(STAGE_TO_STATION[s]).toBe("ingestion");
    }
  });

  it("lights the ingestion node when the object write reaches it (AC6)", () => {
    const events = uploadRun();
    const at = events.findIndex((e) => e.stage === "storage.upload" && e.phase === "end");
    const view = deriveView(events, at);
    expect(view.stations.ingestion.status).toBe("done");
    expect(view.activeStation).toBe("ingestion");
  });

  it("the single ingestion node is done at the end, carrying every phase (AC6)", () => {
    const events = uploadRun();
    const view = deriveView(events, events.length - 1);
    expect(view.stations.ingestion.status).toBe("done");
    // storage.upload (start+end) + the five rag.ingest.* ends all land on one node.
    const stages = view.stations.ingestion.events.map((e) => e.stage);
    expect(stages).toContain("storage.upload");
    expect(stages).toContain("rag.ingest.tokenize");
    expect(stages).toContain("rag.ingest.metadata");
  });

  it("leaves ingestion idle on a normal chat (AC4 regression guard)", () => {
    seq = 0;
    const chat: TraceEvent[] = [
      ev("frontend", "end", { message: "hi" }),
      ev("backend", "start"),
      ev("agent.route", "end", { query: "hi" }),
      ev("rag.embed", "end", { dim: 1536 }),
      ev("rag.retrieve", "end", { chunks: [] }),
      ev("agent.think", "end", { decision: "answer" }),
      ev("llm.generate", "end", { answer: "Hello." }),
      ev("respond", "end", { answer: "Hello." }),
      ev("backend", "end", {}),
    ];
    const view = deriveView(chat, chat.length - 1);
    expect(view.stations.ingestion.status).toBe("idle");
    expect(view.stations.ingestion.events).toHaveLength(0);
    expect(chat.some((e) => e.stage === "storage.upload")).toBe(false);
  });
});
