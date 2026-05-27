// 020-turn-diff: the pure core behind "compare with previous turn". The lesson —
// "the context window is finite and grows with the conversation" — is best taught
// by comparison, so we diff two turns' per-section context-window breakdowns and
// highlight what grew/shrank/stayed the same.
//
// `contextSections(events)` is the SINGLE source of the per-section token split:
// the Agent-anatomy context-window bar consumes it too, so the bar and the diff
// can never disagree (a parity test pins the numbers). It deliberately reuses the
// same coarse `tok()` estimate the bar has always shown (chars/4), NOT a real
// tokenizer — the diff matches what's on screen, labelled approximate. It reads
// only existing event `data`; the prior turn's trace is loaded via 022.

import type { TraceEvent } from "../types/events";

export type Section = "system" | "history" | "rag" | "tools" | "user";

// Order is fixed so the diff renders deterministically.
export const SECTIONS: Section[] = ["system", "history", "rag", "tools", "user"];

/** The bar's rough token estimate: ~4 chars per token (mirrors AgentDetail). */
export const tok = (s: string | undefined): number => Math.ceil((s?.length ?? 0) / 4);

function lastEnd(events: TraceEvent[], stage: string): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].stage === stage && events[i].phase === "end") return events[i];
  }
  return undefined;
}

/**
 * Per-section token estimate for one turn — identical to what the Agent-anatomy
 * context-window bar derives (so the two share one source). Sections absent from
 * the trace report 0.
 */
export function contextSections(events: TraceEvent[]): Record<Section, number> {
  const route = lastEnd(events, "agent.route");
  const prompt = lastEnd(events, "llm.prompt");
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
    rag: tok(context),
    tools: tok(toolResultsText),
    history: tok(historyText),
    user: tok(query),
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
