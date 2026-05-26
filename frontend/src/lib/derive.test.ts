// Bug-fix regression (UX cleanup): when a run finishes the canvas must SETTLE —
// no station left pulsing, no edge lit, no streaming caret. The terminal trace
// event is `backend/end` (the outermost BACKEND stage closes after respond and
// db.write), so keying "finished" off `respond/end` left the Backend station
// stuck "active" forever. These tests pin the settled end-state and the live
// mid-stream state so the two can't drift apart.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveView } from "./derive";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// A realistic full chat run, in emission order. The tail is the load-bearing
// part: llm → respond(frontend) → db.write(database) → backend close.
function fullRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "start"),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.embed", "start"),
    ev("rag.embed", "end", { dim: 1536 }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "start"),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.prompt", "end", { system: "you are…" }),
    ev("llm.generate", "start"),
    ev("llm.generate", "progress", { token: "Hello" }),
    ev("llm.generate", "progress", { token: "." }),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "start"),
    ev("respond", "end", { answer: "Hello." }),
    ev("db.write", "start"),
    ev("db.write", "end", { operation: "INSERT", total_rows: 1 }),
    ev("backend", "end", { answer: "Hello.", delivery: "stream" }),
  ];
}

describe("deriveView — settled end state", () => {
  it("clears the active station once the run finishes (backend/end is terminal)", () => {
    const events = fullRun();
    const view = deriveView(events, events.length - 1);

    expect(view.activeStation).toBeNull();
    expect(view.activeHops).toHaveLength(0);
    expect(view.streaming).toBe(false);
    // The completed trace is still inspectable — stations rest in "done".
    expect(view.stations.backend.status).toBe("done");
    expect(view.stations.llm.status).toBe("done");
    expect(view.answer).toBe("Hello.");
  });

  it("keeps a station active mid-stream (before backend closes)", () => {
    const events = fullRun();
    // Cursor parked on the streaming token, well before backend/end.
    const at = events.findIndex((e) => e.stage === "llm.generate" && e.phase === "progress");
    const view = deriveView(events, at);

    expect(view.activeStation).toBe("llm");
    expect(view.streaming).toBe(true);
  });
});
