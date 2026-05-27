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

// 032-network-boundary (AC4) — the persist (db.write) emphasis is not cleared the
// instant the event passes: a run whose last event is db.write keeps the database
// station as the emphasized active station (the dwell is handled in pacing.ts).
describe("deriveView — persistence emphasis (032 AC4)", () => {
  it("keeps the database station active at a run ending in db.write", () => {
    seq = 0;
    const events = [
      ev("respond", "end", { answer: "x" }),
      ev("db.write", "start"),
      ev("db.write", "end", { operation: "INSERT", total_rows: 1 }),
    ];
    const view = deriveView(events, events.length - 1);
    expect(view.activeStation).toBe("database");
    expect(view.stations.database.status).toBe("done");
  });
});

// 014-tour-scripted (AC2/AC3) — the guided tour emphasizes the station it is
// narrating. Emphasis is a pure projection: `deriveView` takes the tour's current
// station and echoes it as `emphasizedStation` (exactly one while touring, null
// when idle/done or no station is passed). No timers, no React.
describe("deriveView — tour emphasis (014 AC2/AC3)", () => {
  it("emphasizes exactly the passed tour station while a stop is active", () => {
    const events = fullRun();
    const at = events.findIndex((e) => e.stage === "agent.route");
    const view = deriveView(events, at, "agent");

    expect(view.emphasizedStation).toBe("agent");
  });

  it("emphasizes the tour station regardless of which station is otherwise active", () => {
    const events = fullRun();
    // Cursor parked on the RAG stage, but the tour is narrating the LLM.
    const at = events.findIndex((e) => e.stage === "rag.embed");
    const view = deriveView(events, at, "llm");

    expect(view.emphasizedStation).toBe("llm");
    expect(view.activeStation).toBe("rag"); // the spotlight is independent
  });

  it("emphasizes no station when no tour station is passed (idle/done)", () => {
    const events = fullRun();
    expect(deriveView(events, events.length - 1).emphasizedStation).toBeNull();
    expect(deriveView(events, 3, null).emphasizedStation).toBeNull();
  });
});

// 026-agent-tool-autonomy (AC7) — retrieval is now an agent *decision*, not a
// forced pre-step. A run where the agent never calls search_knowledge_base emits
// no rag.* events, so the RAG station must stay idle throughout and never light a
// hop — the projection tolerates a run with conditional (absent) retrieval.
describe("deriveView — conditional retrieval (026 AC7)", () => {
  function noRetrievalRun(): TraceEvent[] {
    seq = 0;
    // A math run: the agent decides to call the calculator (an MCP tool) and
    // never retrieves — no rag.embed/search/retrieve at all.
    return [
      ev("frontend", "end", { message: "2+2?" }),
      ev("backend", "start"),
      ev("agent.route", "end", { query: "2+2?" }),
      ev("mcp.discover", "end", { tools: [{ name: "calculator" }] }),
      ev("agent.think", "start"),
      ev("llm.prompt", "end", { system: "…" }),
      ev("agent.think", "end", { decision: "call_tools" }),
      ev("mcp.call", "start", { tool: "calculator" }),
      ev("mcp.call", "end", { tool: "calculator", result: "4", found: true }),
      ev("agent.think", "end", { decision: "answer" }),
      ev("llm.generate", "end", { answer: "4." }),
      ev("respond", "end", { answer: "4." }),
      ev("backend", "end", { answer: "4." }),
    ];
  }

  it("never lights the RAG station when the agent did not retrieve", () => {
    const events = noRetrievalRun();
    // The RAG station stays idle at every cursor of the run.
    for (let cursor = 0; cursor < events.length; cursor++) {
      const view = deriveView(events, cursor);
      expect(view.stations.rag.status).toBe("idle");
      expect(view.activeHops.some((h) => h.id.includes("rag"))).toBe(false);
    }
  });
});

// 010-llm-as-brain (AC2) — the reasoning round-trip: the agent calls the model to
// decide, so `llm.prompt` is now a START/END span. The LLM station must light up
// *during* that span and the Agent ⇄ LLM hop must animate both ways.
describe("deriveView — reasoning round-trip (010 AC2)", () => {
  function reasoningRound(): TraceEvent[] {
    seq = 0;
    return [
      ev("agent.route", "end", { query: "hi" }), // agent
      ev("agent.think", "start"), // agent
      ev("llm.prompt", "start"), // llm — the agent consults the brain
      ev("llm.prompt", "end", { system: "…" }), // llm
      ev("agent.think", "end", { decision: "answer" }), // back to agent
    ];
  }

  it("lights the LLM and runs agent→llm while the model is deciding", () => {
    const events = reasoningRound();
    const at = events.findIndex((e) => e.stage === "llm.prompt" && e.phase === "start");
    const view = deriveView(events, at);

    expect(view.activeStation).toBe("llm");
    expect(view.stations.llm.status).toBe("active");
    expect(view.activeHops.map((h) => h.id)).toContain("agent-llm");
  });

  it("returns control to the agent (llm→agent) when the round ends", () => {
    const events = reasoningRound();
    const view = deriveView(events, events.length - 1);

    expect(view.activeStation).toBe("agent");
    const hop = view.activeHops.find((h) => h.id === "agent-llm");
    expect(hop).toBeDefined();
    expect(hop?.reverse).toBe(true); // packet travels llm → agent
  });
});
