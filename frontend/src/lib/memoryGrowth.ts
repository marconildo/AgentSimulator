// 039-memory-growth-visualization — the pure projection behind the Agent's
// turn-by-turn Memory growth panel. `deriveMemoryGrowth(events, cursor)` reads
// the latest `db.read` END ≤ cursor and projects the real per-pair token
// weights the backend emitted (`recent_tokens`), so the rows reconcile with the
// budget's `Memory (long-term)` slice (one tokenizer source — backend's
// `cl100k_base` — per §6).
//
// The lesson this panel teaches: only the *visible text* (the user's message +
// the assistant's final answer) survives between turns. The intermediate
// reasoning, tool calls and tool observations are discarded; the model's
// "long-term memory" is just the chat transcript folded back into the system
// block. The growth view makes that ceiling visible turn by turn.

import type { TraceEvent } from "../types/events";
import { lastEnd } from "./turnDiff";

/** One stored prior turn — what re-enters the model's window next time. */
export interface MemoryGrowthRow {
  turn: number; // 1-based, oldest-first
  message: string; // the user's question of this prior turn
  answer: string; // the assistant's final answer (the only thing carried)
  tokens: number; // real tiktoken count, from the backend (cl100k_base)
  barWidth: number; // tokens / max(rows.tokens) — for the bar visualization
}

export interface MemoryGrowth {
  available: boolean; // false ⇒ pre-039 trace; render the flat list only
  rows: MemoryGrowthRow[]; // oldest → newest, empty before any db.read
  totalTokens: number; // Σ rows.tokens — what occupies the window today
  nextToFallOut: number | null; // 1-based turn # of the oldest row when at limit
  limit: number; // the limit the backend used (currently 5)
}

const EMPTY: MemoryGrowth = {
  available: false,
  rows: [],
  totalTokens: 0,
  nextToFallOut: null,
  limit: 0,
};

/**
 * Project the Memory growth view as of the cursor. `cursor` is an index into
 * `events`; everything strictly after it is invisible (step/replay). Before any
 * `db.read` (or for a trace without `recent_tokens`), the view degrades to
 * `available=false` so the Long-term-Memory panel renders only the existing
 * flat history list — no zero-bars, no crash (AC7).
 */
export function deriveMemoryGrowth(events: TraceEvent[], cursor: number): MemoryGrowth {
  if (cursor < 0) return EMPTY;
  const visible = events.slice(0, cursor + 1);
  const read = lastEnd(visible, "db.read");
  if (!read) return EMPTY;

  const recent = read.data.recent as { message: string; answer: string }[] | undefined;
  const recentTokens = read.data.recent_tokens as number[] | undefined;
  const limit = (read.data.limit as number | undefined) ?? 0;

  // Defensive: the contract is one count per pair, same order. If a producer
  // drifts, we hide rather than render misaligned bars (AC7).
  if (!recent || !recentTokens || recent.length !== recentTokens.length) {
    return { ...EMPTY, limit };
  }

  const max = recentTokens.reduce((m, t) => Math.max(m, t), 0);
  const rows: MemoryGrowthRow[] = recent.map((pair, i) => ({
    turn: i + 1,
    message: pair.message,
    answer: pair.answer,
    tokens: recentTokens[i],
    barWidth: max > 0 ? recentTokens[i] / max : 0,
  }));
  const totalTokens = recentTokens.reduce((s, t) => s + t, 0);
  const nextToFallOut = rows.length > 0 && rows.length === limit ? rows[0].turn : null;

  return {
    available: rows.length > 0,
    rows,
    totalTokens,
    nextToFallOut,
    limit,
  };
}
