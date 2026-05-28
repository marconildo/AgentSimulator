// 006-interactive-experiments — per-conversation experiment overrides.
//
// The visitor can change *how* a run executes: rewrite the system prompt
// (042: now the *guardrails* layer) and the agent prompt (042: the *role*
// layer), toggle individual MCP tools, set RAG top-k, pick an OpenAI model
// (042). Settings are scoped per conversation (so switching threads shows
// that thread's own experiment) and kept in memory only — they reset on
// reload (no localStorage; single-instance, §8).
//
// A `null` field means "no override": the request omits it and the backend
// uses its default, so an untouched panel reproduces today's behavior
// exactly (AC5).
//
// 042-agent-anatomy: the `system_prompt` field still maps to the prior
// override but its semantics narrowed — it now replaces only the guardrails
// layer. The new `agent_prompt` field replaces the role layer.

import { create } from "zustand";

export interface ConvExperiment {
  systemPrompt: string | null; // 042: null = backend default GUARDRAILS layer
  agentPrompt: string | null; // 042: null = backend default ROLE layer
  enabledTools: string[] | null; // null = all tools; [] = none; list = only those
  topK: number | null; // null = backend default top-k
  model: string | null; // 042: null = backend default OPENAI model
  // 017-failure-injection — force a failure on the next run; "none" = unchanged.
  // Persists until toggled back to "none" (scoped per conversation, like above).
  simulateFailure: string; // "none" | "tool_error" | "llm_timeout"
}

export const DEFAULT_EXPERIMENT: ConvExperiment = {
  systemPrompt: null,
  agentPrompt: null,
  enabledTools: null,
  topK: null,
  model: null,
  simulateFailure: "none",
};

// Draft conversations (not yet persisted) park their settings here until
// `adopt` migrates them onto the real conversation id (AC7).
export const DRAFT_KEY = "__draft__";

function keyOf(conv: string | null): string {
  return conv ?? DRAFT_KEY;
}

interface ExperimentState {
  byConv: Record<string, ConvExperiment>;
  getFor: (conv: string | null) => ConvExperiment;
  setSystemPrompt: (conv: string | null, value: string | null) => void;
  setAgentPrompt: (conv: string | null, value: string | null) => void;
  toggleTool: (conv: string | null, name: string, allNames: string[]) => void;
  setTopK: (conv: string | null, value: number | null) => void;
  setModel: (conv: string | null, value: string | null) => void;
  setSimulateFailure: (conv: string | null, value: string) => void;
  reset: (conv: string | null) => void;
  adopt: (from: string | null, to: string) => void;
}

export const useExperiment = create<ExperimentState>((set, get) => ({
  byConv: {},

  getFor: (conv) => get().byConv[keyOf(conv)] ?? DEFAULT_EXPERIMENT,

  setSystemPrompt: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      // Blank ⇒ no override (the backend falls back to the default guardrails).
      const next = value && value.trim() ? value : null;
      return { byConv: { ...s.byConv, [key]: { ...cur, systemPrompt: next } } };
    }),

  setAgentPrompt: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      // Blank ⇒ no override (the backend falls back to the default role text).
      const next = value && value.trim() ? value : null;
      return { byConv: { ...s.byConv, [key]: { ...cur, agentPrompt: next } } };
    }),

  toggleTool: (conv, name, allNames) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      const active = new Set(cur.enabledTools ?? allNames);
      if (active.has(name)) active.delete(name);
      else active.add(name);
      // Keep canonical order; normalize "all on" back to null (no override) so an
      // untouched-equivalent set keeps AC5's "send nothing" behavior.
      const ordered = allNames.filter((n) => active.has(n));
      const enabledTools = ordered.length === allNames.length ? null : ordered;
      return { byConv: { ...s.byConv, [key]: { ...cur, enabledTools } } };
    }),

  setTopK: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, topK: value } } };
    }),

  setModel: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      // Blank-safe: "" or null both clear the override.
      const next = value && value.trim() ? value : null;
      return { byConv: { ...s.byConv, [key]: { ...cur, model: next } } };
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
// JSON.stringify, so a default (untouched) conversation sends nothing — AC5.
export interface ChatOverrides {
  system_prompt?: string;
  agent_prompt?: string;
  enabled_tools?: string[];
  top_k?: number;
  model?: string;
  simulate_failure?: string; // 017 — omitted when "none" (today's behavior)
}

export function overridesFor(conv: string | null): ChatOverrides {
  const e = useExperiment.getState().getFor(conv);
  const out: ChatOverrides = {};
  if (e.systemPrompt && e.systemPrompt.trim()) out.system_prompt = e.systemPrompt;
  if (e.agentPrompt && e.agentPrompt.trim()) out.agent_prompt = e.agentPrompt;
  if (e.enabledTools !== null) out.enabled_tools = e.enabledTools; // [] is a real override
  if (e.topK !== null) out.top_k = e.topK;
  if (e.model && e.model.trim()) out.model = e.model;
  // Send the forced failure only when set — "none" omits it, so an untouched
  // conversation reproduces today's run exactly (AC1).
  if (e.simulateFailure && e.simulateFailure !== "none") out.simulate_failure = e.simulateFailure;
  return out;
}
