// 042-agent-anatomy · 🛠️ Tools.
// 043-persisted-agent: writes `agents.enabled_tools` (a concrete list of tool
// names) directly. The agent row's empty list = "no tools"; the full list =
// "all tools". The dialog never persists a `null` (the FE store's prior
// "null = all on" sentinel is gone).

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { toolRows } from "../lib/tools";

export function ToolsSection() {
  const t = useT().agentAnatomy.tools;
  const ex = useT().settings.experiment;
  const { agent, updateAgent } = useActiveAgent();

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const allTools = config?.tools.map((tool) => tool.name) ?? [];
  // The persisted `enabled_tools` is the source of truth. An empty list (newly
  // cloned default carries `[]`) means "all tools" by convention — the FE
  // initializes the row to `allTools` the first time the user toggles one off.
  // This matches the 006 semantic without needing a null sentinel.
  const persisted = agent?.enabled_tools ?? [];
  const allOn = persisted.length === 0;
  const enabled = allOn ? allTools : persisted;
  const enabledCount = allOn ? allTools.length : enabled.length;
  const totalCount = allTools.length;
  const count = allOn ? t.countAll : t.countSome(enabledCount, totalCount);

  function toggle(name: string) {
    if (!agent) return;
    const current = allOn ? new Set(allTools) : new Set(persisted);
    if (current.has(name)) current.delete(name);
    else current.add(name);
    // Persist the canonical order (matches allTools).
    const ordered = allTools.filter((n) => current.has(n));
    // If the user toggled everything back on, persist `[]` to preserve the
    // "all enabled = empty list" convention.
    const next = ordered.length === allTools.length ? [] : ordered;
    updateAgent({ enabled_tools: next });
  }

  return (
    <section data-anatomy-section="tools" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>
      <div className="text-[10.5px] text-[var(--color-label)]">{count}</div>
      <div className="flex flex-col gap-1">
        {toolRows(config?.tools ?? [], ex.toolLabels).map((tool) => {
          const on = enabled.includes(tool.name);
          return (
            <label
              key={tool.name}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-ink)]"
              title={tool.description}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(tool.name)}
                className="accent-[var(--color-accent)]"
                data-testid={`agent-anatomy-tool-${tool.name}`}
              />
              <span className={on ? "" : "text-[var(--color-muted)] line-through"}>
                {tool.label}
              </span>
              <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">
                {tool.name}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
