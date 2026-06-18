/** @vitest-environment jsdom */
// 068-llm-rounds-history — render-level checks that the LLM drill-in lists EVERY
// model call of the turn (each reasoning round + the generation), driven by the
// same simulator cursor as the canvas. The per-call projection itself is covered
// by `lib/llmRounds.test.ts`; this pins the wiring (store → deriveLlmRounds → DOM).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LLMDetail } from "./LLMDetail";
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

afterEach(() => {
  cleanup();
  useSimulator.setState({ events: [], cursor: -1 });
});

describe("LLMDetail", () => {
  it("lists each reasoning round and the generation call", () => {
    seq = 0;
    seed([
      ev("agent.think", "start"),
      ev("llm.prompt", "end", { system: "round-one" }, { latency_ms: 800 }),
      ev("agent.think", "end", { decision: "call_tools", tool_calls: [] }, {}),
      ev("agent.think", "start"),
      ev("llm.prompt", "end", { system: "round-two" }, { latency_ms: 600 }),
      ev("agent.think", "end", { decision: "answer", tool_calls: [] }, {}),
      ev("llm.generate", "end", { answer: "the final answer" }, { latency_ms: 500 }),
    ]);
    render(<LLMDetail onClose={vi.fn()} />);
    expect(screen.getByText("Reasoning round 1")).toBeTruthy();
    expect(screen.getByText("Reasoning round 2")).toBeTruthy();
    expect(screen.getByText("Answer generation")).toBeTruthy();
    expect(screen.getByText("the final answer")).toBeTruthy();
  });

  it("shows the LLM response (tool call + args) when a round is expanded", () => {
    seq = 0;
    seed([
      ev("agent.think", "start"),
      ev("llm.prompt", "end", { system: "s" }, { latency_ms: 800 }),
      ev(
        "agent.think",
        "end",
        {
          decision: "call_tools",
          tool_calls: [{ name: "search_knowledge_base", args: { query: "RAG" } }],
        },
        {},
      ),
    ]);
    render(<LLMDetail onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Reasoning round 1"));
    expect(screen.getByText(/LLM response/i)).toBeTruthy();
    // The model's output for this round — the tool call's arguments, verbatim.
    expect(screen.getByText(/"query": "RAG"/)).toBeTruthy();
  });

  it("notes that a round decided to answer (response = the generation)", () => {
    seq = 0;
    seed([
      ev("agent.think", "start"),
      ev("llm.prompt", "end", { system: "s" }, { latency_ms: 700 }),
      ev("agent.think", "end", { decision: "answer", tool_calls: [] }, {}),
    ]);
    render(<LLMDetail onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Reasoning round 1"));
    expect(screen.getByText(/Decided to answer/i)).toBeTruthy();
  });

  it("shows the empty-state when no LLM call has run yet", () => {
    seed([ev("agent.route", "end", { query: "hi" })]);
    render(<LLMDetail onClose={vi.fn()} />);
    expect(screen.getByText(/No LLM calls yet/i)).toBeTruthy();
  });
});
