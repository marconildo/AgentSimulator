// 011-token-cost (AC3) — the projection aggregates real token usage + cost from
// every LLM call (each reasoning round's decide on agent.think + the final
// generation on llm.generate) into a per-run total the LLM block renders.

import { describe, expect, it } from "vitest";

import { deriveView } from "./derive";
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

function runWithUsage(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("agent.think", "end", { decision: "call_tools" }, {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      cost_usd: 0.0001,
    }),
    ev("mcp.call", "end", { tool: "calculator", result: "4" }),
    ev("agent.think", "end", { decision: "answer" }, {
      prompt_tokens: 150,
      completion_tokens: 10,
      total_tokens: 160,
      cost_usd: 0.0001,
    }),
    ev("llm.generate", "end", { answer: "It is 4." }, {
      prompt_tokens: 200,
      completion_tokens: 30,
      total_tokens: 230,
      cost_usd: 0.00005,
    }),
    ev("respond", "end", { answer: "It is 4." }),
    ev("backend", "end", { answer: "It is 4." }),
  ];
}

describe("deriveView usage aggregation (011 AC3)", () => {
  it("aggregates rounds and token/cost totals across LLM calls", () => {
    const events = runWithUsage();
    const u = deriveView(events, events.length - 1).usage;
    expect(u.rounds).toBe(3); // 2 decide rounds + 1 generation
    expect(u.promptTokens).toBe(450);
    expect(u.completionTokens).toBe(60);
    expect(u.totalTokens).toBe(510);
    expect(u.costUsd).toBeCloseTo(0.00025, 8);
  });

  it("accumulates partially as the cursor advances (mid-run)", () => {
    const events = runWithUsage();
    const u = deriveView(events, 1).usage; // cursor on the first think/end only
    expect(u.rounds).toBe(1);
    expect(u.totalTokens).toBe(120);
  });

  it("is zero when no usage metrics are present (back-compat)", () => {
    seq = 0;
    const events = [
      ev("frontend", "end", { message: "hi" }),
      ev("agent.think", "end", { decision: "answer" }),
      ev("llm.generate", "end", { answer: "hi" }),
      ev("backend", "end", {}),
    ];
    const u = deriveView(events, events.length - 1).usage;
    expect(u.rounds).toBe(2); // calls still counted
    expect(u.totalTokens).toBe(0);
    expect(u.costUsd).toBe(0);
  });
});

describe("deriveView generation metrics (029-ttft-throughput AC4)", () => {
  it("surfaces ttft + throughput from the llm.generate END metrics", () => {
    seq = 0;
    const events = [
      ev("frontend", "end", { message: "hi" }),
      ev("llm.generate", "end", { answer: "hi there" }, {
        tokens: 8,
        ttft_ms: 320,
        tokens_per_sec: 42.5,
      }),
      ev("backend", "end", {}),
    ];
    const g = deriveView(events, events.length - 1).generation;
    expect(g.ttftMs).toBe(320);
    expect(g.tokensPerSec).toBe(42.5);
  });

  it("omits them on a legacy/replayed trace without the metrics", () => {
    seq = 0;
    const events = [
      ev("llm.generate", "end", { answer: "hi" }),
      ev("backend", "end", {}),
    ];
    const g = deriveView(events, events.length - 1).generation;
    expect(g.ttftMs).toBeUndefined();
    expect(g.tokensPerSec).toBeUndefined();
  });
});
