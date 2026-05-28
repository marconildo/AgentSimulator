// 006-interactive-experiments — per-conversation experiment knobs.
//
// 043-persisted-agent moved the four "agent identity" fields (system prompt,
// agent prompt, model, enabled tools) into the SQLite `agents` table — they
// now persist across reloads and are edited via `PATCH /api/agents/{id}` from
// the Agent Anatomy dialog. What stays here are the **per-run** experiment
// levers that aren't part of the agent's identity:
//
//   - `topK`: RAG top-k for this conversation (a retrieval knob, not the agent)
//   - `simulateFailure` (017): forces a failure on the next run
//
// Both are still in memory (single-instance, §8). A `null` field means "no
// override": the request omits it and the backend uses its default, so an
// untouched panel reproduces today's behavior.

import { create } from "zustand";

export interface ConvExperiment {
  topK: number | null; // null = backend default top-k
  // 017-failure-injection — force a failure on the next run; "none" = unchanged.
  simulateFailure: string; // "none" | "tool_error" | "llm_timeout"
}

export const DEFAULT_EXPERIMENT: ConvExperiment = {
  topK: null,
  simulateFailure: "none",
};

// Draft conversations (not yet persisted) park their settings here until
// `adopt` migrates them onto the real conversation id.
export const DRAFT_KEY = "__draft__";

function keyOf(conv: string | null): string {
  return conv ?? DRAFT_KEY;
}

interface ExperimentState {
  byConv: Record<string, ConvExperiment>;
  getFor: (conv: string | null) => ConvExperiment;
  setTopK: (conv: string | null, value: number | null) => void;
  setSimulateFailure: (conv: string | null, value: string) => void;
  reset: (conv: string | null) => void;
  adopt: (from: string | null, to: string) => void;
}

export const useExperiment = create<ExperimentState>((set, get) => ({
  byConv: {},

  getFor: (conv) => get().byConv[keyOf(conv)] ?? DEFAULT_EXPERIMENT,

  setTopK: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, topK: value } } };
    }),

  setSimulateFailure: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, simulateFailure: value } } };
    }),

  reset: (conv) =>
    set((s) => {
      const next = { ...s.byConv };
      delete next[keyOf(conv)];
      return { byConv: next };
    }),

  adopt: (from, to) =>
    set((s) => {
      const fromKey = keyOf(from);
      const settings = s.byConv[fromKey];
      if (!settings || fromKey === to) return {};
      const next = { ...s.byConv, [to]: settings };
      delete next[fromKey];
      return { byConv: next };
    }),
}));

// The request overrides for a conversation. Undefined fields are dropped by
// JSON.stringify, so a default (untouched) conversation sends nothing.
//
// 043-persisted-agent: the four agent fields no longer travel as request-level
// overrides from the FE — the backend now reads them from `sessions.agent_id →
// agents.*`. The protocol still accepts the legacy 006 overrides so programmatic
// callers (and the backend's own tests) keep working; the FE just doesn't send
// them anymore.
export interface ChatOverrides {
  top_k?: number;
  simulate_failure?: string;
}

export function overridesFor(conv: string | null): ChatOverrides {
  const e = useExperiment.getState().getFor(conv);
  const out: ChatOverrides = {};
  if (e.topK !== null) out.top_k = e.topK;
  if (e.simulateFailure && e.simulateFailure !== "none") out.simulate_failure = e.simulateFailure;
  return out;
}
