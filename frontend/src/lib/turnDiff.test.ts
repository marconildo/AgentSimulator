// 020-turn-diff (+ 036-context-window-budget) — `contextSections` + `diffTurns`
// are the pure core behind "compare with previous turn". `contextSections(events)`
// is the SINGLE source of the per-section token split the Agent-anatomy budget
// renders, so the grid and the diff can never disagree. Since 036 it prefers the
// real per-category `context_budget` emitted on the `llm.prompt` END, and only
// falls back to the coarse chars/4 estimate when a trace lacks it (older/replayed).

import { describe, expect, it } from "vitest";

import type { ContextBudget, Phase, Stage, TraceEvent } from "../types/events";
import { contextSections, diffTurns, SECTIONS, tok } from "./turnDiff";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown>): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

const SYSTEM = "You are a helpful assistant grounded in the knowledge base.";
const CONTEXT = "[rag.md] Retrieval-Augmented Generation grounds an LLM in documents.";
const QUERY = "What is RAG?";

const BUDGET: ContextBudget = {
  system: 120,
  tool_defs: 310,
  skills: 30,
  memory: 40,
  retrieved: 100,
  messages: 50,
};

// A turn whose `llm.prompt` END carries the real per-category budget (036).
function realTurn(budget: ContextBudget): TraceEvent[] {
  seq = 0;
  return [
    ev("agent.route", "end", { query: QUERY }),
    ev("llm.prompt", "end", { system: SYSTEM, context: CONTEXT, context_budget: budget }),
  ];
}

// A pre-036 turn (no `context_budget`) — the chars/4 fallback path.
function legacyTurn(opts: {
  system?: string;
  context?: string;
  query?: string;
  tools?: { tool: string; result: string }[];
  history?: { message: string; answer: string }[];
}): TraceEvent[] {
  seq = 0;
  const events: TraceEvent[] = [];
  if (opts.query !== undefined) events.push(ev("agent.route", "end", { query: opts.query }));
  if (opts.history) events.push(ev("db.read", "end", { recent: opts.history }));
  for (const t of opts.tools ?? []) {
    events.push(ev("mcp.call", "end", { tool: t.tool, args: {}, result: t.result }));
  }
  if (opts.system !== undefined || opts.context !== undefined) {
    events.push(
      ev("llm.prompt", "end", { system: opts.system ?? "", context: opts.context ?? "" }),
    );
  }
  return events;
}

describe("contextSections — prefers the real emitted budget (036 AC8)", () => {
  it("returns the six emitted category counts verbatim when present", () => {
    const sec = contextSections(realTurn(BUDGET));
    expect(sec).toEqual(BUDGET);
    // The new category set is exactly the six budget keys.
    expect([...SECTIONS].sort()).toEqual([...Object.keys(BUDGET)].sort());
  });

  it("falls back to the chars/4 estimate when no budget is emitted", () => {
    const tools = [{ tool: "kb_lookup", result: "RAG grounds an LLM." }];
    const history = [{ message: "hi", answer: "hello there" }];
    const sec = contextSections(
      legacyTurn({ system: SYSTEM, context: CONTEXT, query: QUERY, tools, history }),
    );
    expect(sec.system).toBe(tok(SYSTEM));
    expect(sec.retrieved).toBe(tok(CONTEXT));
    expect(sec.memory).toBe(tok("hi / hello there"));
    // Tool results + the user turn fold into Messages; pre-036 traces have no
    // tool-schema or skills slice, so those are 0.
    expect(sec.messages).toBeGreaterThan(0);
    expect(sec.tool_defs).toBe(0);
    expect(sec.skills).toBe(0);
  });

  it("reports 0 for absent sections (no event)", () => {
    const sec = contextSections(legacyTurn({ query: QUERY }));
    expect(sec.system).toBe(0);
    expect(sec.retrieved).toBe(0);
    expect(sec.memory).toBe(0);
    expect(sec.tool_defs).toBe(0);
    expect(sec.skills).toBe(0);
    expect(sec.messages).toBe(tok(QUERY));
  });
});

describe("diffTurns (AC1, AC2)", () => {
  it("returns a signed delta per section + the total delta (AC1)", () => {
    const prev = contextSections(realTurn(BUDGET));
    const curr = contextSections(realTurn({ ...BUDGET, messages: BUDGET.messages + 200 }));
    const d = diffTurns(prev, curr);

    expect(d.perSection.system).toBe(0); // unchanged
    expect(d.perSection.messages).toBe(200); // grew
    const sum = (r: Record<string, number>) => SECTIONS.reduce((s, k) => s + r[k], 0);
    expect(d.total).toBe(sum(curr) - sum(prev));
  });

  it("identical sections → delta 0; a section in one turn only → full add/remove (AC2)", () => {
    const a = contextSections(realTurn(BUDGET));
    const same = diffTurns(a, a);
    for (const k of SECTIONS) expect(same.perSection[k]).toBe(0);
    expect(same.total).toBe(0);

    // A turn that adds tool definitions where the prior had none → full add.
    const withDefs = contextSections(realTurn({ ...BUDGET, tool_defs: 0 }));
    const added = diffTurns(withDefs, a);
    expect(added.perSection.tool_defs).toBe(BUDGET.tool_defs); // prev 0 → full add
    const removed = diffTurns(a, withDefs);
    expect(removed.perSection.tool_defs).toBe(-BUDGET.tool_defs);
  });
});
