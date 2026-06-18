// 068-llm-rounds-history — `deriveLlmRounds(events)` projects EVERY LLM call of the
// turn (each `think` reasoning round + the final `llm.generate`), so the LLM drill-in
// can show the per-round prompt/latency/tokens instead of just the last one (which is
// all the Inspector's `pick()` surfaces). Pure function: live + replay share it.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveLlmRounds } from "./llmRounds";

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  data: Record<string, unknown> = {},
  metrics: Record<string, number> = {},
): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics };
}

// One reasoning round = an `agent.think` span wrapping an `llm.prompt` span.
function round(
  preview: Record<string, unknown>,
  promptLatency: number,
  thinkData: Record<string, unknown>,
  thinkMetrics: Record<string, number>,
): TraceEvent[] {
  return [
    ev("agent.think", "start"),
    ev("llm.prompt", "start"),
    ev("llm.prompt", "end", preview, { latency_ms: promptLatency }),
    ev("agent.think", "end", thinkData, thinkMetrics),
  ];
}

describe("deriveLlmRounds", () => {
  it("returns N reasoning rounds + 1 generation, in order (AC1)", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ...round({ system: "s1" }, 800, { decision: "call_tools", tool_calls: [] }, {}),
      ...round({ system: "s2" }, 600, { decision: "answer", tool_calls: [] }, {}),
      ev("llm.generate", "start"),
      ev("llm.generate", "end", { answer: "hi", model: "gpt-4.1-mini" }, { latency_ms: 500 }),
    ];
    const calls = deriveLlmRounds(events);
    expect(calls).toHaveLength(3);
    expect(calls[0].kind).toBe("reasoning");
    expect(calls[1].kind).toBe("reasoning");
    expect(calls[2].kind).toBe("generation");
    expect(calls[0].kind === "reasoning" && calls[0].round).toBe(1);
    expect(calls[1].kind === "reasoning" && calls[1].round).toBe(2);
  });

  it("each round carries its OWN prompt + latency + tokens, not the last (AC2)", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ...round(
        { system: "round-one-prompt" },
        800,
        { decision: "call_tools", tool_calls: [{ name: "calculator", args: { a: 1 } }] },
        { prompt_tokens: 2000, completion_tokens: 50, total_tokens: 2050, cost_usd: 0.001 },
      ),
      ...round(
        { system: "round-two-prompt" },
        600,
        { decision: "answer", tool_calls: [] },
        { prompt_tokens: 2400, completion_tokens: 80, total_tokens: 2480, cost_usd: 0.002 },
      ),
    ];
    const calls = deriveLlmRounds(events);
    expect(calls).toHaveLength(2);
    const [r1, r2] = calls;
    if (r1.kind !== "reasoning" || r2.kind !== "reasoning") throw new Error("expected reasoning");
    expect(r1.preview.system).toBe("round-one-prompt");
    expect(r2.preview.system).toBe("round-two-prompt");
    expect(r1.latencyMs).toBe(800);
    expect(r2.latencyMs).toBe(600);
    expect(r1.promptTokens).toBe(2000);
    expect(r2.promptTokens).toBe(2400);
    expect(r1.toolCalls).toHaveLength(1);
    expect(r1.toolCalls[0].name).toBe("calculator");
    expect(r2.toolCalls).toHaveLength(0);
  });

  it("the generation entry carries answer + latency + ttft + throughput (AC3)", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ...round({ system: "s" }, 700, { decision: "answer", tool_calls: [] }, {}),
      ev("llm.generate", "start"),
      ev(
        "llm.generate",
        "end",
        { answer: "the answer", model: "gpt-4.1-mini" },
        { latency_ms: 540, ttft_ms: 120, tokens_per_sec: 69 },
      ),
    ];
    const gen = deriveLlmRounds(events).at(-1);
    if (!gen || gen.kind !== "generation") throw new Error("expected generation");
    expect(gen.answer).toBe("the answer");
    expect(gen.latencyMs).toBe(540);
    expect(gen.ttftMs).toBe(120);
    expect(gen.tokensPerSec).toBe(69);
  });

  it("empty / partial logs are graceful (AC4)", () => {
    expect(deriveLlmRounds([])).toEqual([]);
    seq = 0;
    const partial: TraceEvent[] = [
      ...round({ system: "s1" }, 800, { decision: "call_tools", tool_calls: [] }, {}),
      ev("agent.think", "start"),
      ev("llm.prompt", "start"), // second round mid-flight: no END yet
    ];
    const calls = deriveLlmRounds(partial);
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("reasoning");
  });
});
