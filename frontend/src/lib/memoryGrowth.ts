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
  tokens: number; // real tiktoken count of THIS turn alone (backend, cl100k_base)
  cumulativeTokens: number; // Σ tokens[0..i] — what's in the window after this turn
  barWidth: number; // cumulativeTokens / totalTokens — staircase, last row = 1.0
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

  // AC5 (amended 2026-05-28) — bars are cumulative shares of the in-window
  // total, so the panel reads as a staircase of the window filling up turn by
  // turn (`barWidth = Σ tokens[0..i] / totalTokens`). The last row is always
  // 1.0 by construction. Per-row `tokens` still carries the individual weight
  // so the row tooltip can keep the original "this turn cost X" reading.
  const totalTokens = recentTokens.reduce((s, t) => s + t, 0);
  let running = 0;
  const rows: MemoryGrowthRow[] = recent.map((pair, i) => {
    running += recentTokens[i];
    return {
      turn: i + 1,
      message: pair.message,
      answer: pair.answer,
      tokens: recentTokens[i],
      cumulativeTokens: running,
      barWidth: totalTokens > 0 ? running / totalTokens : 0,
    };
  });
  const nextToFallOut = rows.length > 0 && rows.length === limit ? rows[0].turn : null;

  return {
    available: rows.length > 0,
    rows,
    totalTokens,
    nextToFallOut,
    limit,
  };
}
