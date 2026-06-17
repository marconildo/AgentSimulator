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
        // 062-deepagents-execution-spans — DeepAgents steps as their own nodes.
        "plan",
        "delegate",
        "fs-write",
        "fs-read",
      ] as const) {
        expect(x.nodes[node], `${code}/nodes.${node}`).toBeTruthy();
      }
      for (const child of ["embed", "search", "select"] as const) {
        expect(x.child[child], `${code}/child.${child}`).toBeTruthy();
      }
      // The plan-detail count word ("todos" / "tarefas").
      expect(x.planTodos, `${code}/planTodos`).toBeTruthy();
    }
  });
});

// 062-deepagents-execution-spans — the DeepAgents runtime emits agent.plan /
// agent.fs.write / agent.fs.read / agent.delegate; these must surface as their
// own top-level spans in the tree (not folded into `think`).

// A DeepAgents run on the Intermediate rung: route → think → (tools: write_todos
// ⇒ agent.plan) → think → (tools: write_file ⇒ agent.fs.write) → (tools: task ⇒
// agent.delegate wrapping a sub-agent's rag retrieval) → think → (tools:
// read_file ⇒ agent.fs.read) → think → (tools: write_todos ⇒ agent.plan, a plan
// update) → generate → respond.
function deepAgentsRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", 0),
    ev("backend", "start", 1),
    ev("agent.route", "start", 2),
    ev("agent.route", "end", 6),
    ev("agent.think", "start", 10),
    ev("agent.think", "end", 100, { data: { model: "gpt-4.1-mini" } }),
    // write a plan (3 todos)
    ev("agent.plan", "start", 102, { data: { count: 3 } }),
    ev("agent.plan", "end", 110, { data: { count: 3, steps: ["a", "b", "c"] } }),
    ev("agent.think", "start", 112),
    ev("agent.think", "end", 200),
    // write a file
    ev("agent.fs.write", "start", 202, { data: { path: "notes.md" } }),
    ev("agent.fs.write", "end", 210, { data: { path: "notes.md", bytes: 42 } }),
    // delegate to a researcher sub-agent — wraps nested rag retrieval
    ev("agent.delegate", "start", 212, { data: { subagent: "researcher" } }),
    ev("rag.embed", "start", 214),
    ev("rag.embed", "end", 230),
    ev("rag.search", "start", 231),
    ev("rag.search", "end", 260),
    ev("rag.retrieve", "start", 261),
    ev("rag.retrieve", "end", 280),
    ev("agent.delegate", "end", 300, {
      data: { subagent: "researcher", steps: ["search_knowledge_base"], result: "…" },
    }),
    // read a file back
    ev("agent.fs.read", "start", 302, { data: { path: "notes.md" } }),
    ev("agent.fs.read", "end", 310, { data: { path: "notes.md", found: true } }),
    ev("agent.think", "start", 312),
    ev("agent.think", "end", 400),
    // update the plan (2 todos now)
    ev("agent.plan", "start", 402, { data: { count: 2 } }),
    ev("agent.plan", "end", 410, { data: { count: 2, steps: ["a", "b"] } }),
    ev("llm.generate", "start", 412),
    ev("llm.generate", "end", 500),
    ev("respond", "start", 502),
    ev("respond", "end", 505),
    ev("backend", "end", 510),
  ];
}

describe("executionTree — DeepAgents steps as own spans (062)", () => {
  it("AC1: an agent.plan occurrence is its own `plan` span, in order, with the todo count", () => {
    const { spans } = executionTree(deepAgentsRun());
    const plans = spans.filter((s) => s.node === "plan");
    expect(plans.length).toBeGreaterThanOrEqual(1);
    // It is not folded into a think span — there is a plan node right after the
    // first think occurrence.
    const nodes = spans.map((s) => s.node);
    expect(nodes).toContain("plan");
    expect(plans[0].count).toBe(3);
    // The plan span starts after the first think and before the file write.
    const firstThink = spans.find((s) => s.node === "think")!;
    const fsWrite = spans.find((s) => s.node === "fs-write")!;
    expect(plans[0].offsetMs).toBeGreaterThan(firstThink.offsetMs);
    expect(plans[0].offsetMs).toBeLessThan(fsWrite.offsetMs);
  });

  it("AC2: fs.write / fs.read become `fs-write` / `fs-read` spans carrying the path", () => {
    const byNode = (n: string) =>
      executionTree(deepAgentsRun()).spans.filter((s) => s.node === n);
    const w = byNode("fs-write");
    const r = byNode("fs-read");
    expect(w).toHaveLength(1);
    expect(r).toHaveLength(1);
    expect(w[0].detail).toBe("notes.md");
    expect(r[0].detail).toBe("notes.md");
  });

  it("AC3: delegate is one span; nested events do not leak as top-level rows", () => {
    const { spans } = executionTree(deepAgentsRun());
    const delegates = spans.filter((s) => s.node === "delegate");
    expect(delegates).toHaveLength(1);
    expect(delegates[0].detail).toBe("researcher");
    // children come from the sub-agent's tool trail (the `steps` array)
    expect(delegates[0].children.map((c) => c.label)).toEqual(["search_knowledge_base"]);
    // the sub-agent's nested rag retrieval is swallowed — no `retrieve` row appears.
    expect(spans.some((s) => s.node === "retrieve")).toBe(false);
  });

  it("AC4: two agent.plan occurrences yield two ordered `plan` spans (write then update)", () => {
    const plans = executionTree(deepAgentsRun()).spans.filter((s) => s.node === "plan");
    expect(plans).toHaveLength(2);
    expect(plans[0].offsetMs).toBeLessThan(plans[1].offsetMs);
    expect(plans[0].count).toBe(3); // initial plan
    expect(plans[1].count).toBe(2); // updated plan
  });

  it("AC5: a Simple-rung run (no DeepAgents stages) is unchanged", () => {
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
    for (const s of spans) {
      expect(["plan", "delegate", "fs-write", "fs-read"]).not.toContain(s.node);
    }
  });
});
