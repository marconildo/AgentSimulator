// 042-agent-anatomy · 🛠️ Tools.
// 043-persisted-agent: writes `agents.enabled_tools` directly. tool-semantics
// fix: the value is honest now — `null` (unset) = all tools, `[]` = no tools,
// `[...]` = exactly those. Turning every tool off persists `[]` (a real
// no-tools agent); turning them all back on collapses to `null`. The empty
// list no longer means "all" (that overload made a no-tools agent unreachable).

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
  // The persisted `enabled_tools` is the source of truth, with an honest
  // null/[] distinction: `null` (unset) = all tools, `[]` = no tools, `[...]` =
  // exactly those. "All" must be `null`, NOT an empty list — otherwise turning
  // every tool off (which yields `[]`) would be indistinguishable from "all"
  // and silently re-enable everything (the bug this replaced).
  const persisted = agent?.enabled_tools ?? null;
  const allOn = persisted === null;
  const enabled = allOn ? allTools : persisted;
  const enabledCount = enabled.length;
  const totalCount = allTools.length;
  const count = allOn ? t.countAll : t.countSome(enabledCount, totalCount);

  function toggle(name: string) {
    if (!agent) return;
    const current = allOn ? new Set(allTools) : new Set(persisted);
    if (current.has(name)) current.delete(name);
    else current.add(name);
    // Persist the canonical order (matches allTools). Everything on collapses
    // back to `null` (the "all/unset" sentinel); anything less — including the
    // empty set — is persisted as an explicit list, so "no tools" is reachable.
    const ordered = allTools.filter((n) => current.has(n));
    const next = ordered.length === allTools.length ? null : ordered;
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
