// 038-execution-traces — `executionTree` is a pure projection of the event log
// into a LangSmith-style 2-level span tree: parents = pipeline-node occurrences
// in run order; children = the model call / tool call / RAG step nested inside.
// These tests pin the spec's acceptance criteria at the logic level so the panel
// can be reasoned about without rendering. Supersedes 015's waterfall tests
// (same honest timing model: envelope excluded, wall-clock footprint, run span).
//
// Timestamps use a realistic Unix-*milliseconds* base so `toMs` passes them
// through unchanged (toMs only scales values < 1e12) — exact integer durations.

import { describe, expect, it } from "vitest";

import { LANGS } from "../i18n";
import { UI } from "../i18n/strings";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { executionTree } from "./executionTree";

const BASE = 1_700_000_000_000; // Unix ms; toMs returns values ≥ 1e12 unchanged

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  atMs: number,
  extra: { data?: Record<string, unknown>; metrics?: Record<string, number> } = {},
): TraceEvent {
  return {
    trace_id: "t",
    seq: seq++,
    ts: BASE + atMs,
    stage,
    phase,
    label: "",
    data: extra.data ?? {},
    metrics: extra.metrics ?? {},
  };
}

// A plain, no-tool run. route → think (ChatOpenAI) → generate (ChatOpenAI) →
// respond, bracketed by the frontend/backend request envelope (excluded).
function linearRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", 0), // request envelope — excluded
    ev("backend", "start", 1), // envelope — excluded
    ev("agent.route", "start", 2),
    ev("agent.route", "end", 10), // route: off 2, dur 8
    ev("agent.think", "start", 12),
    ev("llm.prompt", "start", 14),
    ev("llm.prompt", "end", 820), // ChatOpenAI child: off 14, dur 806
    ev("agent.think", "end", 822, {
      data: { model: "gpt-4.1-mini" },
      metrics: { total_tokens: 645, cost_usd: 0.0006 },
    }), // think: off 12, dur 810, 645 tok
    ev("llm.generate", "start", 824),
    ev("llm.generate", "end", 1500, {
      metrics: { total_tokens: 442, cost_usd: 0.0002 },
    }), // generate: off 824, dur 676, 442 tok
    ev("respond", "start", 1502),
    ev("respond", "end", 1505), // respond: off 1502, dur 3
    ev("backend", "end", 1510), // envelope — sets the wall-clock end
  ];
}

// A ReAct loop with two tool rounds: route → think → tools → think → tools →
// generate → respond. think and tools each occur twice.
function reactRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", 0),
    ev("backend", "start", 1),
    ev("agent.route", "start", 2),
    ev("agent.route", "end", 6), // route
    // round 1
    ev("agent.think", "start", 10),
    ev("llm.prompt", "start", 12),
    ev("llm.prompt", "end", 300),
    ev("agent.think", "end", 301, {
      data: { model: "gpt-4.1-mini" },
      metrics: { total_tokens: 645, cost_usd: 0.0006 },
    }), // think #1: off 10, dur 291
    ev("mcp.call", "start", 302, { data: { tool: "calculator" } }),
    ev("mcp.call", "end", 500, { data: { tool: "calculator" }, metrics: { latency_ms: 198 } }), // tools #1
    // round 2
    ev("agent.think", "start", 502),
    ev("llm.prompt", "start", 504),
    ev("llm.prompt", "end", 800),
    ev("agent.think", "end", 801, {
      data: { model: "gpt-4.1-mini" },
      metrics: { total_tokens: 674, cost_usd: 0.0006 },
    }), // think #2: off 502, dur 299
    ev("mcp.call", "start", 802, { data: { tool: "calculator" } }),
    ev("mcp.call", "end", 900, { data: { tool: "calculator" }, metrics: { latency_ms: 98 } }), // tools #2
    ev("llm.generate", "start", 902),
    ev("llm.generate", "end", 1200, { metrics: { total_tokens: 442, cost_usd: 0.0002 } }), // generate
    ev("respond", "start", 1202),
    ev("respond", "end", 1206), // respond
    ev("backend", "end", 1210),
  ];
}

// A richer run exercising memory (db.read), a RAG retrieve occurrence with its
// embed/search/select sub-steps, and persist (db.write).
function richRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", 0),
    ev("backend", "start", 1),
    ev("db.read", "start", 2),
    ev("db.read", "end", 8), // memory leaf
    ev("agent.route", "start", 10),
    ev("agent.route", "end", 14), // route leaf
    ev("rag.embed", "start", 310),
    ev("rag.embed", "end", 330, { metrics: { latency_ms: 20 } }),
    ev("rag.search", "start", 331),
    ev("rag.search", "end", 360, { metrics: { latency_ms: 29 } }),
    ev("rag.retrieve", "start", 361),
    ev("rag.retrieve", "end", 380, { metrics: { latency_ms: 19 } }), // retrieve: embed/search/select
    ev("db.write", "start", 708),
    ev("db.write", "end", 720), // persist leaf
    ev("backend", "end", 724),
  ];
}

describe("executionTree — ordered parent spans (AC1)", () => {
  it("maps the log to ordered node spans, excluding the request envelope", () => {
    const { spans } = executionTree(linearRun());

    expect(spans.map((s) => s.node)).toEqual(["route", "think", "generate", "respond"]);
    // The frontend/backend envelope never becomes a span.
    expect(spans.some((s) => (s.node as string) === "request")).toBe(false);

    // Offsets reflect each occurrence's start relative to the run start.
    const byNode = Object.fromEntries(spans.map((s) => [s.node, s]));
    expect(byNode.route.offsetMs).toBe(2);
    expect(byNode.think.offsetMs).toBe(12);
    expect(byNode.generate.offsetMs).toBe(824);
    expect(byNode.respond.offsetMs).toBe(1502);
  });

  it("returns an empty tree for an empty log", () => {
    expect(executionTree([])).toEqual({
      spans: [],
      totalMs: 0,
      totalTokens: 0,
      totalCostUsd: 0,
    });
  });
});

describe("executionTree — repeated nodes (AC2)", () => {
  it("yields N separate parent spans for a node that occurs N times, order preserved", () => {
    const { spans } = executionTree(reactRun());

    expect(spans.map((s) => s.node)).toEqual([
      "route",
      "think",
      "tools",
      "think",
      "tools",
      "generate",
      "respond",
    ]);
    expect(spans.filter((s) => s.node === "think")).toHaveLength(2);
    expect(spans.filter((s) => s.node === "tools")).toHaveLength(2);

    // Order preserved: the first think precedes the second.
    const thinks = spans.filter((s) => s.node === "think");
    expect(thinks[0].offsetMs).toBeLessThan(thinks[1].offsetMs);
  });
});

describe("executionTree — children by node kind (AC3)", () => {
  it("think and generate expose one ChatOpenAI child (model when present)", () => {
    const byNode = Object.fromEntries(executionTree(linearRun()).spans.map((s) => [s.node, s]));

    expect(byNode.think.children).toHaveLength(1);
    expect(byNode.think.children[0].label).toBe("ChatOpenAI");
    expect(byNode.think.children[0].model).toBe("gpt-4.1-mini");

    expect(byNode.generate.children).toHaveLength(1);
    expect(byNode.generate.children[0].label).toBe("ChatOpenAI");
  });

  it("a tools span exposes one child per tool call, named by the tool", () => {
    const tools = executionTree(reactRun()).spans.filter((s) => s.node === "tools");
    expect(tools[0].children.map((c) => c.label)).toEqual(["calculator"]);
    expect(tools[1].children.map((c) => c.label)).toEqual(["calculator"]);
  });

  it("retrieve exposes its rag sub-steps; route/respond/memory/persist are leaves", () => {
    const byNode = Object.fromEntries(executionTree(richRun()).spans.map((s) => [s.node, s]));

    expect(byNode.retrieve.children.map((c) => c.label)).toEqual(["embed", "search", "select"]);
    expect(byNode.route.children).toEqual([]);
    expect(byNode.memory.children).toEqual([]);
    expect(byNode.persist.children).toEqual([]);
  });
});

describe("executionTree — timing, tokens, cost, root totals (AC4)", () => {
  it("durations are the wall-clock footprint; spans carry tokens/cost when measured", () => {
    const byNode = Object.fromEntries(executionTree(linearRun()).spans.map((s) => [s.node, s]));

    expect(byNode.route.durationMs).toBe(8);
    expect(byNode.think.durationMs).toBe(810); // 12 → 822
    expect(byNode.generate.durationMs).toBe(676); // 824 → 1500
    expect(byNode.respond.durationMs).toBe(3);

    expect(byNode.think.tokens).toBe(645);
    expect(byNode.think.costUsd).toBeCloseTo(0.0006, 6);
    expect(byNode.generate.tokens).toBe(442);

    // A node with no token usage carries no token figure (route).
    expect(byNode.route.tokens).toBeUndefined();
  });

  it("the root totals are the run wall-clock span and the sums over spans", () => {
    const tree = executionTree(linearRun());
    expect(tree.totalMs).toBe(1510); // 0 → 1510 incl. the envelope
    expect(tree.totalTokens).toBe(1087); // 645 + 442
    expect(tree.totalCostUsd).toBeCloseTo(0.0008, 6); // 0.0006 + 0.0002
  });
});

describe("executionTree — bar geometry (AC5 core)", () => {
  it("normalized offset/width stay in [0,1] and children fit inside their parent", () => {
    const tree = executionTree(linearRun());
    for (const s of tree.spans) {
      const left = s.offsetMs / tree.totalMs;
      const width = s.durationMs / tree.totalMs;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(1 + 1e-9);
      for (const c of s.children) {
        expect(c.offsetMs).toBeGreaterThanOrEqual(s.offsetMs);
        expect(c.durationMs).toBeLessThanOrEqual(s.durationMs);
      }
    }
  });
});

describe("executionTree is pure (does not mutate input)", () => {
  it("is deterministic and leaves a frozen input untouched", () => {
    const events = Object.freeze(linearRun()) as TraceEvent[];
    const a = executionTree(events);
    const b = executionTree(events);
    expect(a).toEqual(b);
  });
});

describe("timeline.execTrace strings — bilingual (AC6)", () => {
  it("has title/root/empty/total and the nodes + child maps in both en and pt", () => {
    for (const { code } of LANGS) {
      const x = UI[code].timeline.execTrace;
      expect(x.title, `${code}/title`).toBeTruthy();
      expect(x.subtitle, `${code}/subtitle`).toBeTruthy();
      expect(x.empty, `${code}/empty`).toBeTruthy();
      for (const node of [
        "route",
        "think",
        "tools",
        "generate",
        "respond",
        "retrieve",
        "memory",
        "persist",
      ] as const) {
        expect(x.nodes[node], `${code}/nodes.${node}`).toBeTruthy();
      }
      for (const child of ["embed", "search", "select"] as const) {
        expect(x.child[child], `${code}/child.${child}`).toBeTruthy();
      }
    }
  });
});
