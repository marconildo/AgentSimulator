// 042-agent-anatomy — the ordered list of dialog sections.
// One file so the section ids don't have to be hardcoded as union strings in
// the dialog and the open-call sites.

export type AgentAnatomySection =
  | "identity"
  | "system"
  | "agent"
  | "provider"
  | "model"
  | "tools"
  | "knowledge"
  | "skills";

export const SECTION_ORDER: readonly AgentAnatomySection[] = [
  "identity",
  "system",
  "agent",
  // 065-provider-and-model-refresh: provider precedes model (you pick a provider,
  // then a model under it).
  "provider",
  "model",
  "tools",
  "knowledge",
  "skills",
] as const;

// Small icon glyphs used in section headings + the left-rail nav.
export const SECTION_ICONS: Record<AgentAnatomySection, string> = {
  identity: "🪪",
  system: "🧱",
  agent: "🎭",
  provider: "🔌",
  model: "🧠",
  tools: "🛠️",
  knowledge: "📚",
  skills: "🎓",
};
