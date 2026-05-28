// 020-turn-diff (+ 036-context-window-budget): the pure core behind "compare with
// previous turn". The lesson — "the context window is finite and grows with the
// conversation" — is best taught by comparison, so we diff two turns' per-category
// context-window breakdowns and highlight what grew/shrank/stayed the same.
//
// `contextSections(events)` is the SINGLE source of the per-category token split:
// the Agent-anatomy budget grid (036) consumes it too, so the grid and the diff
// can never disagree. Since 036 it prefers the **real** per-category split emitted
// on the `llm.prompt` END (`context_budget`, counted server-side with tiktoken);
// it falls back to the coarse chars/4 estimate only for older/replayed traces that
// lack it (labelled approximate). It reads only existing event `data`; the prior
// turn's trace is loaded via 022.

import type { ContextBudget, TraceEvent } from "../types/events";

// The six "used" categories (mirrors backend BUDGET_CATEGORIES); Free space is
// derived in `contextBudget.ts`, not a section here. Order is fixed so the diff
// and grid render deterministically.
export type Section = keyof ContextBudget;

export const SECTIONS: Section[] = [
  "system",
  "tool_defs",
  "skills",
  "memory",
  "retrieved",
  "messages",
];

/** The fallback's rough token estimate: ~4 chars per token (pre-036 traces). */
export const tok = (s: string | undefined): number => Math.ceil((s?.length ?? 0) / 4);

export function lastEnd(events: TraceEvent[], stage: string): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].stage === stage && events[i].phase === "end") return events[i];
  }
  return undefined;
}

/**
 * Per-category token split for one turn — the single source shared by the
 * Agent-anatomy budget grid and the "compare with previous turn" diff. Prefers
 * the real `context_budget` emitted on the latest `llm.prompt` END (036); falls
 * back to the chars/4 estimate when absent. Categories with no content report 0.
 */
export function contextSections(events: TraceEvent[]): Record<Section, number> {
  const prompt = lastEnd(events, "llm.prompt");
  const emitted = prompt?.data.context_budget as ContextBudget | undefined;
  if (emitted) {
    return {
      system: emitted.system ?? 0,
      tool_defs: emitted.tool_defs ?? 0,
      skills: emitted.skills ?? 0,
      memory: emitted.memory ?? 0,
      retrieved: emitted.retrieved ?? 0,
      messages: emitted.messages ?? 0,
    };
  }

  // chars/4 fallback (pre-036 / replayed traces): reconstruct the categories from
  // the legacy event data the bar used to read. Tool *schemas* and skills were
  // never on the trace then, so those slices are honestly 0.
  const route = lastEnd(events, "agent.route");
  const read = lastEnd(events, "db.read");
  const query = (route?.data.query as string | undefined) ?? "";
  const system = (prompt?.data.system as string | undefined) ?? "";
  const context = (prompt?.data.context as string | undefined) ?? "";

  const toolResultsText = events
    .filter((e) => e.stage === "mcp.call" && e.phase === "end")
    .map((e) => `${String(e.data.tool)} -> ${String(e.data.result)}`)
    .join("\n");

  const historyPairs =
    (read?.data.recent as { message: string; answer: string }[] | undefined) ?? [];
  const historyText = historyPairs.map((h) => `${h.message} / ${h.answer}`).join("\n");

  return {
    system: tok(system),
    tool_defs: 0,
    skills: 0,
    memory: tok(historyText),
    retrieved: tok(context),
    // The user turn + tool results make up the working thread.
    messages: tok(query) + tok(toolResultsText),
  };
}

export interface TurnDiff {
  perSection: Record<Section, number>; // signed delta curr − prev, per section
  total: number; // signed delta of the totals
}

/**
 * Diff two turns' section breakdowns: a signed delta per section + the total.
 * An identical section is 0 (unchanged); a section present in only one turn is a
 * full add (+) or remove (−), since an absent section reports 0 (AC1, AC2).
 */
export function diffTurns(
  prev: Record<Section, number>,
  curr: Record<Section, number>,
): TurnDiff {
  const perSection = {} as Record<Section, number>;
  let total = 0;
  for (const s of SECTIONS) {
    const delta = (curr[s] ?? 0) - (prev[s] ?? 0);
    perSection[s] = delta;
    total += delta;
  }
  return { perSection, total };
}
