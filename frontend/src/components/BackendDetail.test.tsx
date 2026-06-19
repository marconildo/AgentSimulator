/** @vitest-environment jsdom */
// 077-backend-lifecycle-flow — the Backend "open full view" is now an
// orchestration flowchart: payload received → load history → agent invoked →
// persist → response streamed, each with its real trace data + latency. Pure
// projection of the captured trace (same cursor as the canvas).

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendDetail } from "./BackendDetail";
import { useSimulator } from "../store/useSimulator";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  data: Record<string, unknown> = {},
  metrics: Record<string, number> = {},
): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics };
}

function seed(events: TraceEvent[]): void {
  useSimulator.setState({ events, cursor: events.length - 1 });
}

// A full turn's worth of orchestration events.
function fullTurn(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "what is RAG?", request: { message: "what is RAG?", top_k: 4 } }),
    ev("backend", "start", { message: "what is RAG?" }),
    ev("db.read", "end", { table: "messages", recent: [{ message: "hi", answer: "hello" }] }, { latency_ms: 12 }),
    ev("agent.route", "end", { query: "what is RAG?" }),
    ev("agent.think", "end", {
      decision: "call_tools",
      tool_calls: [{ name: "search_knowledge_base", args: { query: "RAG" } }],
    }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "end", { decision: "answer", tool_calls: [] }),
    ev("llm.generate", "end", { answer: "RAG is retrieval-augmented generation." }),
    ev("db.write", "end", { operation: "INSERT", row_id: "msg-42", total_rows: 3 }, { latency_ms: 8 }),
    ev(
      "backend",
      "end",
      { answer: "RAG is retrieval-augmented generation.", delivery: "stream", session_id: "sess-1" },
      { latency_ms: 1234 },
    ),
  ];
}

afterEach(() => {
  cleanup();
  useSimulator.setState({ events: [], cursor: -1 });
});

describe("BackendDetail — lifecycle flowchart (077)", () => {
  it("renders the five orchestration steps in order", () => {
    seed(fullTurn());
    render(<BackendDetail onClose={vi.fn()} />);
    for (const title of [
      "Payload received",
      "Load history",
      "AI agent invoked",
      "Persist conversation",
      "Response streamed back",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("shows the received payload (message + request body)", () => {
    seed(fullTurn());
    render(<BackendDetail onClose={vi.fn()} />);
    expect(screen.getAllByText("what is RAG?").length).toBeGreaterThan(0);
    expect(screen.getByText(/"top_k": 4/)).toBeTruthy();
  });

  it("summarizes the agent loop (rounds, tools, retrievals + pointer)", () => {
    seed(fullTurn());
    render(<BackendDetail onClose={vi.fn()} />);
    expect(screen.getByText(/Reasoning rounds/i)).toBeTruthy();
    expect(screen.getByText("search_knowledge_base")).toBeTruthy();
    expect(screen.getByText(/Open the Agent/i)).toBeTruthy();
  });

  it("shows the persist + response steps with their data", () => {
    seed(fullTurn());
    render(<BackendDetail onClose={vi.fn()} />);
    expect(screen.getByText("msg-42")).toBeTruthy();
    expect(screen.getByText("stream")).toBeTruthy();
    expect(screen.getByText(/retrieval-augmented generation/)).toBeTruthy();
  });

  it("renders later steps as pending when they haven't run yet", () => {
    seq = 0;
    seed([ev("backend", "start", { message: "hi" })]);
    render(<BackendDetail onClose={vi.fn()} />);
    // The receive step is done; the rest are pending.
    expect(screen.getByText("Persist conversation")).toBeTruthy();
    expect(screen.getAllByText(/waiting/i).length).toBeGreaterThan(0);
  });

  it("shows the empty-state when nothing has been received yet", () => {
    seq = 0;
    seed([ev("agent.route", "end", { query: "hi" })]);
    render(<BackendDetail onClose={vi.fn()} />);
    expect(screen.getByText(/Nothing received/i)).toBeTruthy();
  });
});
