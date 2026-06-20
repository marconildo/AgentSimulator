// 035-conditional-upload-nodes + 080-ingestion-pipeline-merge — the Ingestion node
// (and its hops) is hidden by default and revealed only when the current trace shows
// an upload. 080 folded Object Storage into Ingestion, so `ingestion` is the only
// upload-revealed station and there are two write-path hops (backend→ingestion,
// ingestion→rag). Visibility is a pure projection of the log via hasUploadActivity.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { hasUploadActivity } from "./derive";
import { DEFAULT_SELECTION } from "./selection";
import { visibleHopsFor, visibleStationIdsFor } from "./stations";

const UPLOAD_STATIONS = ["ingestion"] as const;
const UPLOAD_HOPS = [
  ["backend", "ingestion"],
  ["ingestion", "rag"],
] as const;

function ev(stage: Stage, phase: Phase = "end"): TraceEvent {
  return { trace_id: "t", seq: 0, ts: 0, stage, phase, label: "", data: {}, metrics: {} };
}

describe("hasUploadActivity (AC4)", () => {
  it("is true when the log carries storage.upload or any rag.ingest.* event", () => {
    expect(hasUploadActivity([ev("storage.upload")])).toBe(true);
    expect(hasUploadActivity([ev("frontend"), ev("rag.ingest.chunk")])).toBe(true);
    expect(hasUploadActivity([ev("rag.ingest.embed")])).toBe(true);
    expect(hasUploadActivity([ev("rag.ingest.store")])).toBe(true);
  });

  it("is false for a plain chat log and for an empty log", () => {
    const chat = [ev("frontend"), ev("agent.route"), ev("rag.retrieve"), ev("llm.generate")];
    expect(hasUploadActivity(chat)).toBe(false);
    expect(hasUploadActivity([])).toBe(false);
  });
});

describe("station visibility gated by showUpload (AC1, AC2)", () => {
  it("hides the ingestion node by default", () => {
    const ids = new Set(visibleStationIdsFor(DEFAULT_SELECTION));
    for (const id of UPLOAD_STATIONS) expect(ids.has(id)).toBe(false);
    // the query-path nodes are unaffected
    for (const id of ["frontend", "backend", "agent", "database", "rag", "mcp", "llm"]) {
      expect(ids.has(id as never)).toBe(true);
    }
  });

  it("reveals the ingestion node when showUpload is set", () => {
    const ids = new Set(visibleStationIdsFor(DEFAULT_SELECTION, true));
    for (const id of UPLOAD_STATIONS) expect(ids.has(id)).toBe(true);
  });
});

describe("hop visibility gated by showUpload (AC3)", () => {
  it("hides the two write-path hops by default", () => {
    const hops = visibleHopsFor("en", DEFAULT_SELECTION);
    for (const [s, t] of UPLOAD_HOPS) {
      expect(hops.some((h) => h.source === s && h.target === t)).toBe(false);
    }
    // a normal query hop is still present
    expect(hops.some((h) => h.source === "agent" && h.target === "rag")).toBe(true);
  });

  it("shows the two write-path hops when showUpload is set", () => {
    const hops = visibleHopsFor("en", DEFAULT_SELECTION, true);
    for (const [s, t] of UPLOAD_HOPS) {
      expect(hops.some((h) => h.source === s && h.target === t)).toBe(true);
    }
  });
});
