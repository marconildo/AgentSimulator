// 018-cumulative-hud (T1) — the pure usage tally + cumulative fold. `tallyUsage`
// extracts one turn's real token/cost usage (the exact logic `deriveView` runs:
// summed over `agent.think` + `llm.generate` END metrics, 011) plus the counting
// rules clarified for the HUD — RAG hit = each retrieved chunk; tool call = each
// item the agent elected on `agent.think.tool_calls` (the canonical source after
// 026-agent-tool-autonomy, where `search_knowledge_base` is an agent-elected tool
// whose observation lives on the RAG station, not on `mcp.call`).
// `cumulativeUsage` folds a list of per-turn records into the running totals
// (AC1), tolerating evicted turns (null → `partial`).

import { describe, expect, it } from "vitest";

import { deriveView } from "./derive";
import { cumulativeUsage, electedToolCalls, tallyUsage, type TurnUsage } from "./usage";
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

// A realistic single turn: route → retrieve (2 chunks) → think (round 1, elects
// two MCP tools) → two mcp.call rounds → think (round 2, answer) → generate →
// respond. The `tool_calls` arrays on each `agent.think` END mirror what the
// real backend emits (`graph.py:243`) — the source of truth for "what the agent
// decided to call this turn".
function oneTurn(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("rag.retrieve", "end", { chunks: [{ text: "a" }, { text: "b" }], k: 4 }),
    ev("agent.think", "end", {
      decision: "call_tools",
      tool_calls: [
        { name: "calculator", args: { expression: "2+2" } },
        { name: "kb_lookup", args: { topic: "RAG" } },
      ],
    }, {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      cost_usd: 0.0001,
    }),
    ev("mcp.call", "end", { tool: "calculator", args: { expression: "2+2" }, result: "4" }),
    ev("mcp.call", "end", { tool: "kb_lookup", args: { topic: "RAG" }, result: "RAG" }),
    ev("agent.think", "end", { decision: "answer", tool_calls: [] }, {
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

  it("counts a tool call per agent-elected call and a RAG hit per retrieved chunk", () => {
    const t = tallyUsage(oneTurn());
    expect(t.toolCalls).toBe(2); // two tool_calls elected on agent.think (calculator + kb_lookup)
    expect(t.ragHits).toBe(2); // two retrieved chunks (orthogonal — pre-026 retrieval)
  });

  it("only counts END phases (a started-but-unfinished tool call is not a hit)", () => {
    seq = 0;
    const t = tallyUsage([
      ev("agent.think", "start", { tool_calls: [{ name: "calculator", args: {} }] }),
      ev("mcp.call", "start", { tool: "calculator" }),
      ev("rag.retrieve", "start", {}),
    ]);
    expect(t.toolCalls).toBe(0);
    expect(t.ragHits).toBe(0);
  });

  it("AC — counts search_knowledge_base as a tool call (026 follow-up)", () => {
    // After 026-agent-tool-autonomy, retrieval is a tool the AGENT elects, but
    // its observation fires on `rag.retrieve` (the RAG station), not `mcp.call`.
    // The HUD's "tool calls" counter under-counted by 1 every such turn — this
    // pins the fix so the counter reads from `agent.think.tool_calls` instead.
    seq = 0;
    const events: TraceEvent[] = [
      ev("agent.think", "end", {
        decision: "call_tools",
        tool_calls: [{ name: "search_knowledge_base", args: { query: "what is RAG" } }],
      }),
      ev(
        "rag.retrieve",
        "end",
        {
          chunks: [
            { source: "rag.md", score: 0.5 },
            { source: "agents.md", score: 0.25 },
          ],
          k: 4,
        },
      ),
      ev("agent.think", "end", { decision: "answer", tool_calls: [] }),
      ev("llm.generate", "end", { answer: "RAG is..." }),
    ];
    const t = tallyUsage(events);
    expect(t.toolCalls).toBe(1); // search_knowledge_base, elected by the agent
    expect(t.ragHits).toBe(2); // two retrieved chunks (still counted separately)
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

describe("electedToolCalls (026 follow-up — retrieval is a tool too)", () => {
  it("returns one entry per agent.think.tool_calls item, in elected order", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ev("agent.think", "end", {
        decision: "call_tools",
        tool_calls: [
          { name: "calculator", args: { expression: "2+2" } },
          { name: "kb_lookup", args: { topic: "RAG" } },
        ],
      }),
      ev("mcp.call", "end", { tool: "calculator", args: { expression: "2+2" }, result: "4" }),
      ev("mcp.call", "end", { tool: "kb_lookup", args: { topic: "RAG" }, result: "RAG..." }),
      ev("agent.think", "end", { decision: "answer", tool_calls: [] }),
    ];
    const calls = electedToolCalls(events);
    expect(calls).toHaveLength(2);
    expect(calls[0].tool).toBe("calculator");
    expect(calls[0].args).toEqual({ expression: "2+2" });
    expect(calls[0].result).toBe("4");
    expect(calls[1].tool).toBe("kb_lookup");
    expect(calls[1].result).toBe("RAG...");
  });

  it("pairs a search_knowledge_base elected call with its rag.retrieve observation", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ev("agent.think", "end", {
        decision: "call_tools",
        tool_calls: [{ name: "search_knowledge_base", args: { query: "what is RAG" } }],
      }),
      ev("rag.retrieve", "end", {
        chunks: [
          { source: "rag.md", score: 0.5 },
          { source: "agents.md", score: 0.25 },
        ],
        k: 4,
      }),
    ];
    const calls = electedToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe("search_knowledge_base");
    expect(calls[0].args).toEqual({ query: "what is RAG" });
    expect(calls[0].found).toBe(true);
    // The structured summary the UI renders ("4 chunks, top: rag.md · 0.50").
    expect(calls[0].retrievalSummary).toEqual({
      count: 2,
      topSource: "rag.md",
      topScore: 0.5,
    });
  });

  it("flags an abstention when search_knowledge_base returns zero chunks", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ev("agent.think", "end", {
        decision: "call_tools",
        tool_calls: [{ name: "search_knowledge_base", args: { query: "off-corpus" } }],
      }),
      ev("rag.retrieve", "end", { chunks: [], k: 4 }),
    ];
    const calls = electedToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].found).toBe(false); // empty retrieval → agent could honestly abstain
    expect(calls[0].retrievalSummary?.count).toBe(0);
  });

  it("returns an empty list for a trace with no agent.think.tool_calls", () => {
    seq = 0;
    expect(electedToolCalls([ev("frontend", "end"), ev("backend", "end")])).toEqual([]);
  });

  it("ignores agent.think START — only the END carries the elected calls", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ev("agent.think", "start", {
        tool_calls: [{ name: "calculator", args: {} }],
      }),
    ];
    expect(electedToolCalls(events)).toEqual([]);
  });
});

describe("input/output token split (029-ttft-throughput AC5)", () => {
  it("input (prompt) + output (completion) tokens sum to the displayed total", () => {
    const c = cumulativeUsage([tallyUsage(oneTurn())]);
    expect(c.promptTokens + c.completionTokens).toBe(c.totalTokens);
    expect(c.promptTokens).toBeGreaterThan(0);
    expect(c.completionTokens).toBeGreaterThan(0);
  });

  it("has no input/output split when there is no usage", () => {
    const c = cumulativeUsage([]);
    expect(c.totalTokens).toBe(0);
    expect(c.promptTokens + c.completionTokens).toBe(0);
  });
});
