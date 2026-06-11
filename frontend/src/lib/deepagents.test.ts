// 057-deepagents-runtime (AC5) — the Agent drill-in renders the plan + the virtual
// file system as a pure projection of the trace events. These pin that projection at
// the logic level (no rendering): derivePlan / deriveVfs / deriveDelegations.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import {
  derivePlan,
  deriveTodos,
  deriveDelegations,
  deriveVfs,
  hasDeepAgents,
} from "./deepagents";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// A DeepAgents preamble: plan → write(plan.md) → delegate → write(research.md) →
// read(research.md), as emitted on the Intermediate rung.
function deepRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("agent.route", "end", { query: "q" }),
    ev("agent.plan", "end", {
      steps: ["Search the KB", "Answer the question"],
      todos: [
        { content: "Search the KB", status: "completed" },
        { content: "Answer the question", status: "in_progress" },
      ],
      count: 2,
    }),
    ev("agent.fs.write", "end", { path: "plan.md", content: "1. Search the KB\n2. Answer", bytes: 26 }),
    ev("agent.delegate", "end", {
      subagent: "researcher",
      subtask: "Search the KB",
      result: "Chunk size trades recall vs precision.",
      steps: ["search_knowledge_base"],
      rounds: 1,
    }),
    ev("agent.fs.write", "end", { path: "research.md", content: "Chunk size trades recall vs precision.", bytes: 38 }),
    ev("agent.fs.read", "end", { path: "research.md", content: "Chunk size trades recall vs precision.", found: true }),
    ev("agent.think", "end", { decision: "answer" }),
  ];
}

// A Simple-rung run: no DeepAgents stages at all.
function simpleRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("agent.route", "end", { query: "q" }),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "end", { answer: "ok" }),
  ];
}

describe("derivePlan", () => {
  it("returns the ordered steps from the agent.plan END", () => {
    expect(derivePlan(deepRun())).toEqual(["Search the KB", "Answer the question"]);
  });

  it("returns [] when there was no planner (Simple rung)", () => {
    expect(derivePlan(simpleRun())).toEqual([]);
  });
});

describe("deriveTodos", () => {
  it("returns todos with their per-item status", () => {
    expect(deriveTodos(deepRun())).toEqual([
      { content: "Search the KB", status: "completed" },
      { content: "Answer the question", status: "in_progress" },
    ]);
  });

  it("falls back to pending when an event carries only steps", () => {
    const evs: TraceEvent[] = [ev("agent.plan", "end", { steps: ["a", "b"] })];
    expect(deriveTodos(evs)).toEqual([
      { content: "a", status: "pending" },
      { content: "b", status: "pending" },
    ]);
  });

  it("returns [] on a Simple-rung run", () => {
    expect(deriveTodos(simpleRun())).toEqual([]);
  });
});

describe("deriveVfs", () => {
  it("folds write + read ops into files, flagging wrote/read", () => {
    const files = deriveVfs(deepRun());
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(Object.keys(byPath).sort()).toEqual(["plan.md", "research.md"]);
    expect(byPath["plan.md"].wrote).toBe(true);
    expect(byPath["plan.md"].read).toBe(false);
    // research.md was written then read back — same content survives the round-trip.
    expect(byPath["research.md"].wrote).toBe(true);
    expect(byPath["research.md"].read).toBe(true);
    expect(byPath["research.md"].content).toBe("Chunk size trades recall vs precision.");
  });

  it("returns [] on a Simple-rung run", () => {
    expect(deriveVfs(simpleRun())).toEqual([]);
  });
});

describe("deriveDelegations", () => {
  it("returns the sub-agent hand-off with its result + tool trail", () => {
    const dels = deriveDelegations(deepRun());
    expect(dels).toHaveLength(1);
    expect(dels[0].subagent).toBe("researcher");
    expect(dels[0].subtask).toBe("Search the KB");
    expect(dels[0].result).toContain("Chunk size");
    expect(dels[0].steps).toEqual(["search_knowledge_base"]);
    expect(dels[0].rounds).toBe(1);
  });
});

describe("hasDeepAgents", () => {
  it("is true on a DeepAgents run and false on Simple", () => {
    expect(hasDeepAgents(deepRun())).toBe(true);
    expect(hasDeepAgents(simpleRun())).toBe(false);
  });
});
