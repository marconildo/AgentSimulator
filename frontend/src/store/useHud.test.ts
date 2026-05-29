// 018-cumulative-hud (T3) — the per-conversation HUD store re-derives the running
// totals from the saved per-message traces (the clarified source: re-derive via
// 022's memoized loader, not live in-memory accumulation). It reflects only the
// messages it is given (the active conversation, AC2), folds their tallies, and
// flips `partial` when a turn's trace has been evicted — never throwing.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/traceCache", () => ({ loadTrace: vi.fn() }));

import type { Stage, TraceEvent } from "../types/events";
import * as traceCache from "../lib/traceCache";
import { useHud, ZERO_USAGE } from "./useHud";

let seq = 0;
const ev = (
  stage: Stage,
  data: Record<string, unknown> = {},
  metrics: Record<string, number> = {},
): TraceEvent => ({ trace_id: "t", seq: seq++, ts: 0, stage, phase: "end", label: "", data, metrics });

// One turn: a single LLM round (100 tokens, $0.001), one tool call, two RAG hits.
// Post-026 the source of truth for "tool calls" is `agent.think.tool_calls` (the
// elected list), not `mcp.call` ENDs alone — so the think round carries the
// matching elected call, and the mcp.call END pairs as the observation.
const turnEvents = (): TraceEvent[] => {
  seq = 0;
  return [
    ev("rag.retrieve", { chunks: [{ text: "a" }, { text: "b" }] }),
    ev(
      "agent.think",
      {
        decision: "call_tools",
        tool_calls: [{ name: "calculator", args: { expression: "2+2" } }],
      },
      {
        prompt_tokens: 80,
        completion_tokens: 20,
        total_tokens: 100,
        cost_usd: 0.001,
      },
    ),
    ev("mcp.call", { tool: "calculator", args: { expression: "2+2" }, result: "4" }),
  ];
};

const msg = (id: string) => ({
  id,
  message: "q",
  answer: "a",
  chunks: [],
  skills: [],
  documents: [],
  created_at: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  useHud.setState({ cumulative: ZERO_USAGE, loading: false });
});

describe("useHud — cumulative re-derivation (018)", () => {
  it("folds each message's trace into the running totals", async () => {
    vi.mocked(traceCache.loadTrace).mockResolvedValue({ ok: true, events: turnEvents() });

    await useHud.getState().recompute([msg("m1"), msg("m2")]);

    const c = useHud.getState().cumulative;
    expect(c.turns).toBe(2);
    expect(c.totalTokens).toBe(200);
    expect(c.costUsd).toBeCloseTo(0.002, 8);
    expect(c.toolCalls).toBe(2);
    expect(c.ragHits).toBe(4);
    expect(c.partial).toBe(false);
    // Each message's trace was loaded by id (= trace_id).
    expect(traceCache.loadTrace).toHaveBeenCalledWith("m1");
    expect(traceCache.loadTrace).toHaveBeenCalledWith("m2");
  });

  it("AC2 — an evicted turn flips `partial` and is skipped from the sums, no throw", async () => {
    vi.mocked(traceCache.loadTrace).mockImplementation(async (id: string) =>
      id === "gone" ? { ok: false, expired: true } : { ok: true, events: turnEvents() },
    );

    await useHud.getState().recompute([msg("m1"), msg("gone"), msg("m3")]);

    const c = useHud.getState().cumulative;
    expect(c.turns).toBe(3); // the evicted turn still happened
    expect(c.totalTokens).toBe(200); // but only the two available turns are summed
    expect(c.partial).toBe(true);
  });

  it("AC2 — an empty conversation has zeroed, non-partial totals", async () => {
    await useHud.getState().recompute([]);
    expect(useHud.getState().cumulative).toEqual(ZERO_USAGE);
    expect(traceCache.loadTrace).not.toHaveBeenCalled();
  });

  it("AC2 — a later recompute supersedes an earlier one (only the active set shows)", async () => {
    // First conversation: two turns. Second: one turn. The second must win even if
    // its (awaited) result settles after we kick it off.
    vi.mocked(traceCache.loadTrace).mockResolvedValue({ ok: true, events: turnEvents() });
    await useHud.getState().recompute([msg("a"), msg("b")]);
    expect(useHud.getState().cumulative.turns).toBe(2);

    await useHud.getState().recompute([msg("c")]);
    expect(useHud.getState().cumulative.turns).toBe(1);
  });
});
