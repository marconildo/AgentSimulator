// 020-turn-diff — `contextSections` + `diffTurns` are the pure core behind
// "compare with previous turn". `contextSections(events)` reproduces the exact
// per-section token estimate the Agent-anatomy context-window bar already shows
// (one source — a parity test pins it); `diffTurns(prev, curr)` returns a signed
// delta per section + the total. The lesson: the context window grows with the
// conversation, shown by comparison.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { contextSections, diffTurns, SECTIONS, tok } from "./turnDiff";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown>): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

const SYSTEM = "You are a helpful assistant grounded in the knowledge base.";
const CONTEXT = "[rag.md] Retrieval-Augmented Generation grounds an LLM in documents.";
const QUERY = "What is RAG?";

// A turn with all five sections present.
function turn(opts: {
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
    events.push(ev("llm.prompt", "end", { system: opts.system ?? "", context: opts.context ?? "" }));
  }
  return events;
}

describe("contextSections — parity with the bar's tok() estimate", () => {
  it("computes each section as Math.ceil(len/4) over the same text the bar uses", () => {
    const tools = [{ tool: "kb_lookup", result: "RAG grounds an LLM." }];
    const history = [{ message: "hi", answer: "hello there" }];
    const events = turn({ system: SYSTEM, context: CONTEXT, query: QUERY, tools, history });
    const sec = contextSections(events);

    expect(sec.system).toBe(tok(SYSTEM));
    expect(sec.rag).toBe(tok(CONTEXT));
    expect(sec.user).toBe(tok(QUERY));
    expect(sec.tools).toBe(tok("kb_lookup -> RAG grounds an LLM."));
    expect(sec.history).toBe(tok("hi / hello there"));
  });

  it("reports 0 for absent sections (no event)", () => {
    const sec = contextSections(turn({ query: QUERY }));
    expect(sec.system).toBe(0);
    expect(sec.rag).toBe(0);
    expect(sec.tools).toBe(0);
    expect(sec.history).toBe(0);
    expect(sec.user).toBe(tok(QUERY));
  });
});

describe("diffTurns (AC1, AC2)", () => {
  it("returns a signed delta per section + the total delta (AC1)", () => {
    const prev = contextSections(turn({ system: SYSTEM, query: "hi" }));
    const curr = contextSections(
      turn({
        system: SYSTEM, // unchanged
        query: "a much longer follow-up question than the first one",
        history: [{ message: "hi", answer: "hello there friend" }], // grew from 0
      }),
    );
    const d = diffTurns(prev, curr);

    expect(d.perSection.system).toBe(0); // unchanged
    expect(d.perSection.history).toBeGreaterThan(0); // grew (full add)
    expect(d.perSection.user).toBeGreaterThan(0); // longer question
    // total delta = sum(curr) − sum(prev)
    const sum = (r: Record<string, number>) => SECTIONS.reduce((s, k) => s + r[k], 0);
    expect(d.total).toBe(sum(curr) - sum(prev));
  });

  it("identical sections → delta 0; a section in one turn only → full add/remove (AC2)", () => {
    const a = contextSections(turn({ system: SYSTEM, context: CONTEXT, query: QUERY }));
    const same = diffTurns(a, a);
    for (const k of SECTIONS) expect(same.perSection[k]).toBe(0);
    expect(same.total).toBe(0);

    // A turn that adds tools where the prior had none → full add of `tools`.
    const withTools = contextSections(
      turn({ system: SYSTEM, context: CONTEXT, query: QUERY, tools: [{ tool: "calc", result: "42" }] }),
    );
    const added = diffTurns(a, withTools);
    expect(added.perSection.tools).toBe(withTools.tools); // prev had 0 → full add
    // And the reverse is a full remove (negative).
    const removed = diffTurns(withTools, a);
    expect(removed.perSection.tools).toBe(-withTools.tools);
  });
});
