// 018-cumulative-hud: pure usage accounting, independent of any data source.
//
// `tallyUsage(events)` folds ONE turn's trace into its real usage — the token /
// cost / rounds logic is the *exact* logic `deriveView` runs (summed over every
// LLM call: each reasoning round's decide on `agent.think` + the final
// `llm.generate`, 011-token-cost), extracted here so the HUD and the canvas can
// never drift (a parity test pins them). It also applies the HUD counting rules
// clarified for 018: a **tool call** is each `mcp.call` END; a **RAG hit** is each
// retrieved chunk (no relevance threshold — count what actually happened).
//
// `cumulativeUsage(records)` folds a list of per-turn tallies into the running
// conversation totals (AC1). An evicted turn (its trace gone from the bounded
// store) is passed as `null`: it still counts as a turn, but its tokens can't be
// summed, so the result is flagged `partial` (no crash, no faked numbers).

import type { TraceEvent } from "../types/events";

export interface TurnUsage {
  rounds: number; // LLM calls in the turn (decide rounds + the generation)
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  toolCalls: number; // mcp.call ENDs
  ragHits: number; // retrieved chunks
}

export interface CumulativeUsage {
  turns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  toolCalls: number;
  ragHits: number;
  // True when at least one turn's trace was evicted → the totals under-count.
  partial: boolean;
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/** Fold one turn's trace events into its real token/cost usage + HUD counts. */
export function tallyUsage(events: TraceEvent[]): TurnUsage {
  const u: TurnUsage = {
    rounds: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    toolCalls: 0,
    ragHits: 0,
  };
  for (const ev of events) {
    if (ev.phase !== "end") continue;
    // Every decide round (agent.think) and the generation (llm.generate) is a
    // real LLM call — total rounds, tokens and cost across them (mirrors derive).
    if (ev.stage === "agent.think" || ev.stage === "llm.generate") {
      u.rounds += 1;
      u.promptTokens += num(ev.metrics.prompt_tokens);
      u.completionTokens += num(ev.metrics.completion_tokens);
      u.totalTokens += num(ev.metrics.total_tokens);
      u.costUsd += num(ev.metrics.cost_usd);
    }
    // A tool call = each completed MCP call.
    if (ev.stage === "mcp.call") u.toolCalls += 1;
    // A RAG hit = each chunk actually retrieved for the turn.
    if (ev.stage === "rag.retrieve" && Array.isArray(ev.data.chunks)) {
      u.ragHits += (ev.data.chunks as unknown[]).length;
    }
  }
  return u;
}

/** Fold per-turn tallies into the running conversation totals; `null` = evicted. */
export function cumulativeUsage(records: (TurnUsage | null)[]): CumulativeUsage {
  const c: CumulativeUsage = {
    turns: records.length,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    toolCalls: 0,
    ragHits: 0,
    partial: false,
  };
  for (const r of records) {
    if (!r) {
      c.partial = true; // the turn happened, but its trace is gone
      continue;
    }
    c.promptTokens += r.promptTokens;
    c.completionTokens += r.completionTokens;
    c.totalTokens += r.totalTokens;
    c.costUsd += r.costUsd;
    c.toolCalls += r.toolCalls;
    c.ragHits += r.ragHits;
  }
  return c;
}
