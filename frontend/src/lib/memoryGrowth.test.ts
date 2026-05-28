// 039-memory-growth-visualization — `deriveMemoryGrowth(events, cursor)` projects
// the turn-by-turn growth of long-term memory (only the visible text carries
// forward). Pure function: live streaming and step/replay share this code path
// (replay is just a smaller cursor). Token counts come from the backend via
// `recent_tokens` on the `db.read` END so the rows reconcile with the budget's
// Memory slice (one source of truth).

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveMemoryGrowth } from "./memoryGrowth";

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  data: Record<string, unknown>,
  metrics: Record<string, number> = {},
): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics };
}

const PAIRS = [
  { message: "Ola", answer: "Olá! Como posso ajudar?" },
  {
    message: "Quanto é 30+5?",
    answer: "Vamos imaginar 30 maçãs em uma cesta e mais 5 chegando.",
  },
  { message: "obrigado", answer: "De nada." },
];

function dbRead(
  recent: { message: string; answer: string }[],
  recent_tokens: number[] | undefined,
  limit = 5,
): TraceEvent[] {
  return [
    ev("agent.route", "end", { query: "anything" }),
    ev("db.read", "start", {}),
    ev("db.read", "end", { recent, recent_tokens, limit, table: "messages" }),
  ];
}

describe("deriveMemoryGrowth — empty / pre-db.read (AC4)", () => {
  it("returns an empty view with available=false before any db.read", () => {
    seq = 0;
    const events = [ev("agent.route", "end", { query: "anything" })];
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.available).toBe(false);
    expect(g.rows).toEqual([]);
    expect(g.totalTokens).toBe(0);
    expect(g.nextToFallOut).toBeNull();
    expect(g.limit).toBe(0);
  });

  it("cursor < 0 (nothing played) is the same empty view, no crash", () => {
    seq = 0;
    const events = dbRead(PAIRS, [20, 598, 22]);
    const g = deriveMemoryGrowth(events, -1);
    expect(g.available).toBe(false);
    expect(g.rows).toEqual([]);
  });
});

describe("deriveMemoryGrowth — projection of recent + recent_tokens (AC4, AC5)", () => {
  it("populates rows oldest→newest with totalTokens = Σ counts", () => {
    seq = 0;
    const events = dbRead(PAIRS, [20, 598, 22]);
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.available).toBe(true);
    expect(g.rows).toHaveLength(3);
    expect(g.rows.map((r) => r.turn)).toEqual([1, 2, 3]);
    expect(g.rows.map((r) => r.message)).toEqual(PAIRS.map((p) => p.message));
    expect(g.rows.map((r) => r.tokens)).toEqual([20, 598, 22]);
    expect(g.totalTokens).toBe(20 + 598 + 22);
  });

  // AC5 (amended 2026-05-28) — bars are CUMULATIVE shares of the in-window
  // total, so the panel reads as a staircase of the window filling up turn by
  // turn. The first cut normalized to max(tokens), which let a single long
  // answer dominate and hid the staircase intuition users arrive at the panel
  // with. See specs/039-memory-growth-visualization/spec.md AC5 amendment.
  it("computes barWidth as cumulative share so the last row always reaches 1.0", () => {
    seq = 0;
    const events = dbRead(PAIRS, [20, 598, 22]);
    const g = deriveMemoryGrowth(events, events.length - 1);
    const total = 20 + 598 + 22;
    const bw = g.rows.map((r) => r.barWidth);
    expect(bw[0]).toBeCloseTo(20 / total, 5);
    expect(bw[1]).toBeCloseTo((20 + 598) / total, 5);
    expect(bw[2]).toBeCloseTo(1, 5); // last row is always 100%
    // Monotonic non-decreasing — the staircase property.
    expect(bw[0]).toBeLessThanOrEqual(bw[1]);
    expect(bw[1]).toBeLessThanOrEqual(bw[2]);
  });

  it("exposes cumulativeTokens per row so the label can read 'X / total'", () => {
    seq = 0;
    const events = dbRead(PAIRS, [20, 598, 22]);
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.rows.map((r) => r.cumulativeTokens)).toEqual([20, 20 + 598, 20 + 598 + 22]);
    // The last cumulative count equals totalTokens by definition.
    expect(g.rows[g.rows.length - 1].cumulativeTokens).toBe(g.totalTokens);
  });

  it("keeps any non-zero row visible (barWidth > 0)", () => {
    seq = 0;
    const events = dbRead(PAIRS, [20, 598, 22]);
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.rows.map((r) => r.barWidth).every((w) => w > 0)).toBe(true);
  });
});

describe("deriveMemoryGrowth — limit-5 fall-out signal (AC6)", () => {
  it("flags the oldest row when recent.length === limit", () => {
    seq = 0;
    const fivePairs = [
      { message: "p1", answer: "a1" },
      { message: "p2", answer: "a2" },
      { message: "p3", answer: "a3" },
      { message: "p4", answer: "a4" },
      { message: "p5", answer: "a5" },
    ];
    const events = dbRead(fivePairs, [10, 20, 30, 40, 50], 5);
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.limit).toBe(5);
    expect(g.nextToFallOut).toBe(1); // oldest row's turn
  });

  it("returns null when recent.length < limit (room left in the window)", () => {
    seq = 0;
    const events = dbRead(PAIRS, [20, 598, 22], 5);
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.nextToFallOut).toBeNull();
    expect(g.limit).toBe(5);
  });
});

describe("deriveMemoryGrowth — graceful fallback (AC7)", () => {
  it("returns available=false when db.read lacks recent_tokens (older trace)", () => {
    seq = 0;
    const events = dbRead(PAIRS, undefined, 5);
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.available).toBe(false);
    expect(g.rows).toEqual([]);
    expect(g.totalTokens).toBe(0);
  });

  it("returns available=false when lengths don't match (defensive)", () => {
    seq = 0;
    // The contract is same length / same order. If a producer drifts, the
    // panel hides rather than rendering misaligned bars.
    const events = dbRead(PAIRS, [20, 598], 5); // only 2 counts for 3 pairs
    const g = deriveMemoryGrowth(events, events.length - 1);
    expect(g.available).toBe(false);
  });
});
