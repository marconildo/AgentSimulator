// 018-cumulative-hud (T1) — the pure usage tally + cumulative fold. `tallyUsage`
// extracts one turn's real token/cost usage (the exact logic `deriveView` runs:
// summed over `agent.think` + `llm.generate` END metrics, 011) plus the counting
// rules clarified for the HUD — tool call = each `mcp.call` END, RAG hit = each
// retrieved chunk. `cumulativeUsage` folds a list of per-turn records into the
// running conversation totals (AC1), tolerating evicted turns (null → `partial`).

import { describe, expect, it } from "vitest";

import { deriveView } from "./derive";
import { cumulativeUsage, tallyUsage, type TurnUsage } from "./usage";
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

// A realistic single turn: route → retrieve (2 chunks) → think (round 1, calls
// two tools) → two mcp.call rounds → think (round 2) → generate → respond.
function oneTurn(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("rag.retrieve", "end", { chunks: [{ text: "a" }, { text: "b" }], k: 4 }),
    ev("agent.think", "end", { decision: "call_tools" }, {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      cost_usd: 0.0001,
    }),
    ev("mcp.call", "end", { tool: "calculator", result: "4" }),
    ev("mcp.call", "end", { tool: "kb_lookup", result: "RAG" }),
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

describe("tallyUsage (018 AC1b — parity + counting rules)", () => {
  it("matches deriveView's token/cost/rounds usage (no drift)", () => {
    const events = oneTurn();
    const t = tallyUsage(events);
    const u = deriveView(events, events.length - 1).usage;

    expect(t.rounds).toBe(u.rounds);
    expect(t.promptTokens).toBe(u.promptTokens);
    expect(t.completionTokens).toBe(u.completionTokens);
    expect(t.totalTokens).toBe(u.totalTokens);
    expect(t.costUsd).toBeCloseTo(u.costUsd, 8);
  });

  it("counts a tool call per mcp.call END and a RAG hit per retrieved chunk", () => {
    const t = tallyUsage(oneTurn());
    expect(t.toolCalls).toBe(2); // two mcp.call ENDs
    expect(t.ragHits).toBe(2); // two retrieved chunks
  });

  it("only counts END phases (a started-but-unfinished tool call is not a hit)", () => {
    seq = 0;
    const t = tallyUsage([
      ev("mcp.call", "start", { tool: "calculator" }),
      ev("rag.retrieve", "start", {}),
    ]);
    expect(t.toolCalls).toBe(0);
    expect(t.ragHits).toBe(0);
  });

  it("is all-zero for a trace with no usage (back-compat)", () => {
    seq = 0;
    const t = tallyUsage([ev("frontend", "end"), ev("backend", "end")]);
    expect(t).toEqual({
      rounds: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      toolCalls: 0,
      ragHits: 0,
    });
  });
});

describe("cumulativeUsage (018 AC1 — fold over turns)", () => {
  const turn = (over: Partial<TurnUsage> = {}): TurnUsage => ({
    rounds: 2,
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    costUsd: 0.001,
    toolCalls: 1,
    ragHits: 4,
    ...over,
  });

  it("sums tokens/cost and counts turns/toolCalls/ragHits", () => {
    const c = cumulativeUsage([turn(), turn(), turn()]);
    expect(c.turns).toBe(3);
    expect(c.promptTokens).toBe(300);
    expect(c.completionTokens).toBe(60);
    expect(c.totalTokens).toBe(360);
    expect(c.costUsd).toBeCloseTo(0.003, 8);
    expect(c.toolCalls).toBe(3);
    expect(c.ragHits).toBe(12);
    expect(c.partial).toBe(false);
  });

  it("is empty (all zero, not partial) for no turns", () => {
    const c = cumulativeUsage([]);
    expect(c).toEqual({
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      toolCalls: 0,
      ragHits: 0,
      partial: false,
    });
  });

  it("AC2 — an evicted (null) turn still counts as a turn, flips partial, never throws", () => {
    const c = cumulativeUsage([turn(), null, turn()]);
    expect(c.turns).toBe(3); // the gap turn happened — count it
    expect(c.totalTokens).toBe(240); // but its tokens can't be summed
    expect(c.toolCalls).toBe(2);
    expect(c.partial).toBe(true);
  });
});
