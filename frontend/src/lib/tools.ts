// 031-tool-catalog-clarity — the display view-model for the Settings → Tools
// list. One row per advertised tool (exactly the set /api/config returns, never
// filtered), each carrying a friendly bilingual label, the raw model-facing
// handle (verbatim — the model contract), and the backend-provided description.

import type { AppConfig } from "./chatApi";

export interface ToolRow {
  name: string; // raw model-facing handle (verbatim, not translated)
  label: string; // friendly label, falling back to the raw handle if unknown
  description: string; // backend-provided hover text
}

/** Map /api/config's tools to display rows. Keeps every tool (none hidden) so a
 *  future filter can't silently drop one; the friendly label falls back to the
 *  raw handle for any tool not yet in `labels`. */
export function toolRows(
  tools: AppConfig["tools"],
  labels: Record<string, string>,
): ToolRow[] {
  return tools.map((t) => ({
    name: t.name,
    label: labels[t.name] ?? t.name,
    description: t.description,
  }));
}
