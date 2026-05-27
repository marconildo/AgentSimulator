// 034-storage-ingestion-flow — the upload write-path (Frontend → Backend →
// Storage → Ingestion → Vector DB). The new `storage.upload` stage is owned by
// the `storage` station and flows through the pure projection: it lights storage
// then continues to ingestion. A normal chat never emits it, so storage stays idle.

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
    ev("storage.upload", "end", { key: "s/d/a.pdf", size_bytes: 1234, content_type: "application/pdf" }),
    ev("rag.ingest.chunk", "end", { num_chunks: 2 }),
    ev("rag.ingest.embed", "end", { num_vectors: 2 }),
    ev("rag.ingest.store", "end", { chunks_stored: 2 }),
    ev("backend", "end", {}),
  ];
}

describe("storage.upload projection (034-storage-ingestion-flow)", () => {
  it("maps storage.upload to the storage station (AC2)", () => {
    expect(STAGE_TO_STATION["storage.upload"]).toBe("storage");
  });

  it("lights storage when the upload reaches it (AC5)", () => {
    const events = uploadRun();
    const at = events.findIndex((e) => e.stage === "storage.upload" && e.phase === "end");
    const view = deriveView(events, at);
    expect(view.stations.storage.status).toBe("done");
    expect(view.activeStation).toBe("storage");
  });

  it("continues to the ingestion node, both done at the end (AC5)", () => {
    const events = uploadRun();
    const view = deriveView(events, events.length - 1);
    expect(view.stations.storage.status).toBe("done");
    expect(view.stations.ingestion.status).toBe("done");
    expect(view.stations.storage.events).toHaveLength(2); // the start/end pair
  });

  it("leaves storage idle on a normal chat (AC10 regression guard)", () => {
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
    expect(view.stations.storage.status).toBe("idle");
    expect(view.stations.storage.events).toHaveLength(0);
    expect(chat.some((e) => e.stage === "storage.upload")).toBe(false);
  });
});
