// 036-context-window-budget — `deriveBudget(events, cursor)` projects the real
// context-window budget (used/max/free + per-category split) from the trace, and
// `gridCells(...)` allocates the /context-style cell grid. Pure functions: live
// streaming and step/replay share this code path (cursor = a smaller slice).

import { describe, expect, it } from "vitest";

import type { ContextBudget, Phase, Stage, TraceEvent } from "../types/events";
import { CELL_COUNT, DEFAULT_CONTEXT_WINDOW, deriveBudget, gridCells } from "./contextBudget";
import { SECTIONS } from "./turnDiff";

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  data: Record<string, unknown>,
  metrics: Record<string, number> = {},
): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics };
}

const WINDOW = 128_000;
const BUDGET: ContextBudget = {
  system: 2600,
  tool_defs: 3100,
  skills: 300,
  memory: 400,
  retrieved: 1000,
  messages: 500,
};
const PROMPT_TOKENS = 7900; // the real billed used total for this round

// One full reasoning round: think wraps llm.prompt; the real prompt_tokens ride
// the agent.think END (011), the window + budget ride the llm.prompt END (036).
function round(budget: ContextBudget, promptTokens: number, window = WINDOW): TraceEvent[] {
  return [
    ev("agent.route", "end", { query: "What is RAG?" }),
    ev("agent.think", "start", {}),
    ev("llm.prompt", "start", {}),
    ev("llm.prompt", "end", { system: "sys", context_window: window, context_budget: budget }),
    ev("agent.think", "end", { decision: "answer" }, { prompt_tokens: promptTokens }),
  ];
}

// A full turn that also generated an answer (the llm.generate END carries the
// real completion tokens — the answer written into the window).
function roundWithAnswer(
  budget: ContextBudget,
  promptTokens: number,
  completionTokens: number,
  window = WINDOW,
): TraceEvent[] {
  return [
    ...round(budget, promptTokens, window),
    ev("llm.generate", "end", { answer: "…" }, { completion_tokens: completionTokens }),
  ];
}

describe("deriveBudget — used is real, free = max − used (AC5)", () => {
  it("uses the real prompt_tokens for used, derives free and pct against the window", () => {
    seq = 0;
    const events = round(BUDGET, PROMPT_TOKENS);
    const b = deriveBudget(events, events.length - 1);

    expect(b.window).toBe(WINDOW);
    expect(b.used).toBe(PROMPT_TOKENS); // the real billed total, not the estimate
    expect(b.free).toBe(WINDOW - PROMPT_TOKENS);
    expect(b.pct).toBeCloseTo(PROMPT_TOKENS / WINDOW);
    expect(b.estimated).toBe(false);
    // All six categories present, in order, with their emitted token counts.
    expect(b.categories.map((c) => c.key)).toEqual(SECTIONS);
    const sys = b.categories.find((c) => c.key === "system")!;
    expect(sys.tokens).toBe(BUDGET.system);
    expect(sys.pctOfWindow).toBeCloseTo(BUDGET.system / WINDOW);
  });
});

describe("deriveBudget — input + generated answer (completion)", () => {
  it("splits used into input (prompt) + answer (completion), used = input + answer", () => {
    seq = 0;
    const events = roundWithAnswer(BUDGET, PROMPT_TOKENS, 67);
    const b = deriveBudget(events, events.length - 1);
    expect(b.input).toBe(PROMPT_TOKENS);
    expect(b.completion).toBe(67);
    expect(b.used).toBe(PROMPT_TOKENS + 67);
    expect(b.free).toBe(WINDOW - (PROMPT_TOKENS + 67));
  });

  it("has 0 completion before the answer is generated", () => {
    seq = 0;
    const events = round(BUDGET, PROMPT_TOKENS);
    const b = deriveBudget(events, events.length - 1);
    expect(b.completion).toBe(0);
    expect(b.used).toBe(b.input);
  });

  // Regression: the panel used to mix the think call's prompt_tokens with the
  // generate call's completion_tokens, producing a number that was neither a
  // single call's window nor the turn total — and that disagreed with the LLM
  // card / Execution traces / LangSmith (which all show the turn total).
  // The budget must now sum prompt+completion across every real LLM round in
  // the turn (think rounds + generate), so `used` equals the LLM card's total.
  it("sums input AND completion across every real LLM round in the turn", () => {
    seq = 0;
    // A realistic turn: one think round (decide) + a final generate round.
    const events: TraceEvent[] = [
      ev("agent.route", "end", { query: "..." }),
      ev("agent.think", "start", {}),
      ev("llm.prompt", "start", {}),
      ev("llm.prompt", "end", { context_window: WINDOW, context_budget: BUDGET }),
      ev(
        "agent.think",
        "end",
        { decision: "answer" },
        { prompt_tokens: 851, completion_tokens: 949 }, // think also produced tokens
      ),
      ev(
        "llm.generate",
        "end",
        { answer: "…" },
        { prompt_tokens: 649, completion_tokens: 734 },
      ),
    ];
    const b = deriveBudget(events, events.length - 1);
    // Both halves sum across think + generate (mirrors usage.tallyUsage —
    // same code path as the BRAIN/LLM card).
    expect(b.input).toBe(851 + 649); // 1500
    expect(b.completion).toBe(949 + 734); // 1683
    expect(b.used).toBe(b.input + b.completion); // matches Usage & Cost total
  });
});

describe("deriveBudget — cursor-aware (AC6)", () => {
  it("renders a fully free window (0 used) before any llm.prompt, with no crash", () => {
    seq = 0;
    const events = round(BUDGET, PROMPT_TOKENS);
    // Cursor at the agent.route END — before any llm.prompt.
    const b = deriveBudget(events, 0);
    expect(b.used).toBe(0);
    expect(b.window).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(b.free).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(b.categories.every((c) => c.tokens === 0)).toBe(true);
  });

  it("cursor < 0 (nothing played) is fully free", () => {
    const b = deriveBudget(round(BUDGET, PROMPT_TOKENS), -1);
    expect(b.used).toBe(0);
    expect(b.free).toBe(b.window);
  });

  it("input/completion grow turn-cumulatively across rounds; categories reflect the latest llm.prompt", () => {
    seq = 0;
    // Two think rounds in one turn (e.g. think → tools → think). Each emits
    // its own llm.prompt budget + its own real usage.
    const r1 = round({ ...BUDGET, messages: 100 }, 5000);
    const r2 = round({ ...BUDGET, messages: 900 }, 9000);
    const events = [...r1, ...r2];

    // Cursor at the end of round 1: only r1 has run → used == r1.prompt.
    const afterR1 = deriveBudget(events, r1.length - 1);
    expect(afterR1.input).toBe(5000);
    expect(afterR1.used).toBe(5000);
    // Categories come from the latest llm.prompt visible (r1's budget).
    expect(afterR1.categories.find((c) => c.key === "messages")!.tokens).toBe(100);

    // Cursor at end of round 2: input is the SUM across both rounds (matches
    // the LLM card). Categories still reflect the latest round's assembly,
    // which is the right unit — each round mostly re-sends the same system /
    // tool defs / skills, so summing them would multiply-count.
    const afterR2 = deriveBudget(events, events.length - 1);
    expect(afterR2.input).toBe(5000 + 9000);
    expect(afterR2.used).toBe(5000 + 9000);
    expect(afterR2.categories.find((c) => c.key === "messages")!.tokens).toBe(900);
  });
});

describe("deriveBudget — graceful fallback (AC9)", () => {
  it("renders via the chars/4 estimate, flagged estimated, when fields are absent", () => {
    seq = 0;
    // A pre-036 trace: no context_window / context_budget, no real prompt_tokens.
    const events = [
      ev("agent.route", "end", { query: "What is RAG?" }),
      ev("llm.prompt", "end", { system: "You are a helpful assistant.", context: "a passage" }),
    ];
    const b = deriveBudget(events, events.length - 1);
    expect(b.estimated).toBe(true);
    expect(b.window).toBe(DEFAULT_CONTEXT_WINDOW); // fallback window, never 0
    expect(b.window).toBeGreaterThan(0);
    // No real prompt_tokens → used falls back to the sum of the estimated split.
    const sum = b.categories.reduce((s, c) => s + c.tokens, 0);
    expect(b.used).toBe(sum);
    expect(b.free).toBe(b.window - b.used);
  });
});

describe("gridCells — /context-style allocation (AC7)", () => {
  it("allocates colored cells in category order with the remainder as Free space", () => {
    const cats = SECTIONS.map((key) => ({ key, tokens: BUDGET[key] }));
    const used = PROMPT_TOKENS;
    const cells = gridCells(cats, used, WINDOW, CELL_COUNT);

    // Exactly CELL_COUNT cells, summing the used cells + free cells.
    expect(cells.length).toBe(CELL_COUNT);
    const usedCells = Math.round((used / WINDOW) * CELL_COUNT);
    const freeCells = cells.filter((c) => c === "free").length;
    expect(freeCells).toBe(CELL_COUNT - usedCells);
    // Category cells precede the free run (fixed order).
    const firstFree = cells.indexOf("free");
    expect(cells.slice(firstFree).every((c) => c === "free")).toBe(true);
  });

  it("sums category cells exactly to the used-cell count (largest remainder)", () => {
    const cats = SECTIONS.map((key) => ({ key, tokens: BUDGET[key] }));
    const cells = gridCells(cats, PROMPT_TOKENS, WINDOW, CELL_COUNT);
    const usedCells = Math.round((PROMPT_TOKENS / WINDOW) * CELL_COUNT);
    const nonFree = cells.filter((c) => c !== "free").length;
    expect(nonFree).toBe(usedCells);
  });

  it("is all free when nothing is used", () => {
    const cats = SECTIONS.map((key) => ({ key, tokens: 0 }));
    const cells = gridCells(cats, 0, WINDOW, CELL_COUNT);
    expect(cells.every((c) => c === "free")).toBe(true);
  });

  it("lights at least one cell on any usage, even when it rounds to <1% of a huge window", () => {
    const cats = SECTIONS.map((key) => ({ key, tokens: BUDGET[key] }));
    // ~700 tokens of a 1,047,576 window is < 0.07% → would round to 0 cells.
    const cells = gridCells(cats, 700, 1_047_576, CELL_COUNT);
    const nonFree = cells.filter((c) => c !== "free").length;
    expect(nonFree).toBe(1);
  });

  it("renders the completion slice as its own cell color", () => {
    const slices = [
      { key: "system" as const, tokens: 2000 },
      { key: "completion" as const, tokens: 2000 },
    ];
    const cells = gridCells(slices, 64_000, WINDOW, CELL_COUNT); // 50% used
    expect(cells).toContain("completion");
    expect(cells).toContain("system");
  });
});
