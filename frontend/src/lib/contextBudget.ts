// 036-context-window-budget — the pure projection behind the Agent's /context-style
// budget panel. `deriveBudget(events, cursor)` turns the trace up to the playhead
// into the real context-window budget; `gridCells(...)` lays out the cell grid.
// Both are pure, so live streaming and step/replay share one code path (replay is
// just a smaller cursor).
//
// Honesty stance (mirrors Claude Code's `/context`): the **used** total is the
// real billed token usage **summed across every LLM round in the turn** — every
// `agent.think` END (the decide rounds, 011) plus the `llm.generate` END (the
// final answer). This is the *same* code path the BRAIN / LLM card and the HUD
// use via `usage.tallyUsage` — a parity test pins them so the four numeric
// surfaces (Agent → context, LLM card on canvas, Execution traces, LangSmith)
// can never disagree on a turn total. The **per-category split** is the labelled
// tiktoken estimate emitted on the `llm.prompt` END (`context_budget`, 036),
// taken from the *latest* round visible — categories like system / tool defs /
// skills are mostly re-sent every round, so summing them would multiply-count.
// Free = window − used. A pre-036 / replayed trace lacking the fields degrades to
// the chars/4 estimate via `contextSections`, flagged `estimated` (AC9).

import type { ContextBudget, TraceEvent } from "../types/events";
import { contextSections, lastEnd, SECTIONS, type Section } from "./turnDiff";

// Sane non-zero fallback window (mirrors backend DEFAULT_CONTEXT_WINDOW); a 0-width
// window would break the grid.
export const DEFAULT_CONTEXT_WINDOW = 128_000;

// The fixed cell-grid size (20 columns × 3 rows), like `/context`'s "Context Usage".
export const CELL_COUNT = 60;

// A grid/legend slice key: one of the six input categories, or the generated
// answer ("completion"). "free" is the empty remainder.
export type GridSlice = Section | "completion";

export interface CategoryShare {
  key: Section;
  tokens: number;
  pctOfWindow: number; // tokens / window (0..1)
}

export interface Budget {
  window: number; // the model's real context window (or DEFAULT)
  input: number; // the prompt occupying the window this call (real prompt_tokens, or estimate)
  completion: number; // the generated answer's tokens (real, llm.generate) — 0 before it's written
  used: number; // input + completion (what occupied the window this turn)
  free: number; // window − used (never negative)
  pct: number; // used / window (0..1)
  estimated: boolean; // true when the split is the chars/4 fallback (pre-036)
  categories: CategoryShare[]; // the six input categories, in fixed order
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/**
 * Real token usage of this turn — summed across every LLM call ≤ cursor:
 * each `agent.think` END (a decide round, 011) plus the `llm.generate` END
 * (the final answer). Mirrors `usage.tallyUsage` exactly so the budget panel,
 * the BRAIN/LLM card, the HUD and the execution traces never disagree.
 * Returns `null` when no real usage has been recorded yet (no LLM-call END
 * carries `prompt_tokens`) — the caller falls back to the estimate sum.
 */
function realRoundsUsage(
  events: TraceEvent[],
): { input: number; completion: number } | null {
  let input = 0;
  let completion = 0;
  let saw = false;
  for (const ev of events) {
    if (ev.phase !== "end") continue;
    if (ev.stage !== "agent.think" && ev.stage !== "llm.generate") continue;
    const p = num(ev.metrics.prompt_tokens);
    const c = num(ev.metrics.completion_tokens);
    if (p > 0 || c > 0) saw = true;
    input += p;
    completion += c;
  }
  return saw ? { input, completion } : null;
}

/**
 * Project the context-window budget as of the cursor. `cursor` is an index into
 * `events`; everything strictly after it is invisible (step/replay). Before any
 * `llm.prompt`, the window renders fully free (0 used).
 */
export function deriveBudget(events: TraceEvent[], cursor: number): Budget {
  const visible = cursor >= 0 ? events.slice(0, cursor + 1) : [];
  const prompt = lastEnd(visible, "llm.prompt");

  // No prompt assembled yet (cursor before the first reasoning round): the window
  // is genuinely empty — 0 used, everything free, no estimate (AC6).
  if (!prompt) {
    return {
      window: DEFAULT_CONTEXT_WINDOW,
      input: 0,
      completion: 0,
      used: 0,
      free: DEFAULT_CONTEXT_WINDOW,
      pct: 0,
      estimated: true,
      categories: SECTIONS.map((key) => ({ key, tokens: 0, pctOfWindow: 0 })),
    };
  }

  const emitted = prompt.data.context_budget as ContextBudget | undefined;
  const estimated = !emitted;
  const window =
    (prompt.data.context_window as number | undefined) ?? DEFAULT_CONTEXT_WINDOW;

  // One source of truth for the split (prefers the emitted real budget; chars/4
  // fallback otherwise) — shared with the turn diff, so they never disagree.
  const split = contextSections(visible);

  // `input` + `completion` are summed across every LLM round in this turn —
  // every `agent.think` END (decide round) plus the `llm.generate` END (final
  // answer). Same code path as `usage.tallyUsage` (the BRAIN/LLM card and the
  // HUD): the four numeric surfaces always agree on the turn total. Pre-036
  // traces without real metrics fall back to the per-category estimate sum
  // (AC9). The categories themselves are one round's prompt assembly — most
  // (system, tool defs, skills) are re-sent every round, so their sum is < the
  // turn-total `input`; the `estimatedNote` label already discloses this gap.
  const real = realRoundsUsage(visible);
  const estimateSum = SECTIONS.reduce((s, k) => s + split[k], 0);
  const input = real?.input ?? estimateSum;
  const completion = real?.completion ?? 0;
  const used = input + completion;
  const free = Math.max(window - used, 0);

  const categories: CategoryShare[] = SECTIONS.map((key) => ({
    key,
    tokens: split[key],
    pctOfWindow: window > 0 ? split[key] / window : 0,
  }));

  return {
    window,
    input,
    completion,
    used,
    free,
    pct: window > 0 ? used / window : 0,
    estimated,
    categories,
  };
}

/**
 * Allocate a `cellCount`-cell grid: the filled cells (≈ used/window) colored by
 * slice proportion in order, the remainder as "free". Slice cells sum exactly to
 * the used-cell count via largest-remainder rounding, so the whole grid sums to
 * `cellCount` (AC7). When there is *any* usage that would round to 0 cells (a tiny
 * fraction of a huge window), at least one cell is lit so the grid never reads as
 * empty/broken — the exact (sub-1%) figure stays in the headline.
 */
export function gridCells(
  slices: { key: GridSlice; tokens: number }[],
  used: number,
  window: number,
  cellCount: number,
): (GridSlice | "free")[] {
  let usedCells = window > 0 ? clamp(Math.round((used / window) * cellCount), 0, cellCount) : 0;
  if (used > 0 && usedCells === 0) usedCells = 1; // always show a marker for any usage
  const totalTokens = slices.reduce((s, c) => s + Math.max(c.tokens, 0), 0);

  const cells: (GridSlice | "free")[] = [];
  if (usedCells > 0 && totalTokens > 0) {
    // Largest-remainder apportionment so the slice cells sum to usedCells.
    const raw = slices.map((c) => ({
      key: c.key,
      exact: (Math.max(c.tokens, 0) / totalTokens) * usedCells,
    }));
    const counts = raw.map((r) => ({ key: r.key, n: Math.floor(r.exact), rem: r.exact % 1 }));
    let assigned = counts.reduce((s, c) => s + c.n, 0);
    // Hand out the leftover cells to the largest remainders.
    const order = [...counts].sort((a, b) => b.rem - a.rem);
    for (let i = 0; assigned < usedCells; i++, assigned++) {
      order[i % order.length].n += 1;
    }
    for (const c of counts) for (let i = 0; i < c.n; i++) cells.push(c.key);
  }
  while (cells.length < cellCount) cells.push("free");
  return cells;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
