// 057-deepagents-runtime (AC5) — the Agent drill-in renders the plan + the virtual
// file system as a pure projection of the trace events. These pin that projection at
// the logic level (no rendering): derivePlan / deriveVfs / deriveDelegations.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import {
  deriveDeepAgentsSteps,
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

describe("deriveDeepAgentsSteps", () => {
  // AC1 — every DeepAgents action this run, in chronological order, each tagged kind.
  it("returns the five steps in run order with the right kinds", () => {
    const steps = deriveDeepAgentsSteps(deepRun());
    expect(steps.map((s) => s.kind)).toEqual([
      "plan",
      "fs-write",
      "delegate",
      "fs-write",
      "fs-read",
    ]);
  });

  // AC2 — repeated write_todos collapse into ONE plan step showing the LATEST snapshot
  // (the plan is one evolving artifact, not a new block per revision).
  it("collapses repeated agent.plan events into a single plan step (latest snapshot)", () => {
    seq = 0;
    const evs: TraceEvent[] = [
      ev("agent.plan", "end", {
        todos: [
          { content: "Search the KB", status: "in_progress" },
          { content: "Answer", status: "pending" },
        ],
        count: 2,
      }),
      ev("agent.plan", "end", {
        todos: [
          { content: "Search the KB", status: "completed" },
          { content: "Answer", status: "completed" },
        ],
        count: 2,
      }),
    ];
    const steps = deriveDeepAgentsSteps(evs);
    expect(steps.filter((s) => s.kind === "plan")).toHaveLength(1);
    // the single plan step shows the latest (all-completed) snapshot.
    expect(steps[0].todos).toEqual([
      { content: "Search the KB", status: "completed" },
      { content: "Answer", status: "completed" },
    ]);
  });

  // AC3 — file steps carry the path; the delegate step carries the hand-off tuple.
  it("carries the path on fs steps and the hand-off on the delegate step", () => {
    const steps = deriveDeepAgentsSteps(deepRun());
    const writes = steps.filter((s) => s.kind === "fs-write");
    expect(writes.map((s) => s.path)).toEqual(["plan.md", "research.md"]);
    expect(steps.find((s) => s.kind === "fs-read")?.path).toBe("research.md");
    const del = steps.find((s) => s.kind === "delegate");
    expect(del?.subagent).toBe("researcher");
    expect(del?.subtask).toBe("Search the KB");
    expect(del?.result).toContain("Chunk size");
    expect(del?.steps).toEqual(["search_knowledge_base"]);
  });

  // AC4 — Simple rung has no DeepAgents stages → empty trail (panel stays hidden).
  it("returns [] on a Simple-rung run", () => {
    expect(deriveDeepAgentsSteps(simpleRun())).toEqual([]);
  });

  // AC8 — many plan revisions interleaved with file ops still yield exactly ONE plan step
  // (the latest snapshot), positioned at the first plan; file steps render in order.
  it("keeps a single plan step across revisions interleaved with file ops", () => {
    seq = 0;
    const evs: TraceEvent[] = [
      ev("agent.plan", "end", {
        todos: [
          { content: "Search", status: "pending" },
          { content: "Synthesize", status: "pending" },
        ],
        count: 2,
      }),
      ev("agent.fs.write", "end", { path: "notes.md", content: "x", bytes: 1 }),
      ev("agent.plan", "end", {
        todos: [
          { content: "Search", status: "completed" },
          { content: "Synthesize", status: "in_progress" },
        ],
        count: 2,
      }),
      ev("agent.plan", "end", {
        finalized: true,
        todos: [
          { content: "Search", status: "completed" },
          { content: "Synthesize", status: "completed" },
        ],
        count: 2,
      }),
    ];
    const steps = deriveDeepAgentsSteps(evs);
    // exactly one plan step (first position), then the file write.
    expect(steps.map((s) => s.kind)).toEqual(["plan", "fs-write"]);
    expect(steps[0].todos).toEqual([
      { content: "Search", status: "completed" },
      { content: "Synthesize", status: "completed" },
    ]);
  });

  // AC6 — a DeepAgents run that planned + used files but never delegated yields a
  // trail with no `delegate` step (the panel renders the explicit "no sub-agent" line).
  it("has no delegate step when the run did not delegate", () => {
    seq = 0;
    const evs: TraceEvent[] = [
      ev("agent.plan", "end", { todos: [{ content: "Research RAG", status: "pending" }], count: 1 }),
      ev("agent.fs.write", "end", { path: "research.md", content: "x", bytes: 1 }),
      ev("agent.fs.read", "end", { path: "research.md", content: "x", found: true }),
    ];
    const steps = deriveDeepAgentsSteps(evs);
    expect(steps.some((s) => s.kind === "delegate")).toBe(false);
    // sanity: the run still produced the plan + file steps.
    expect(steps.map((s) => s.kind)).toEqual(["plan", "fs-write", "fs-read"]);
  });
});
