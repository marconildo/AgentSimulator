// 042-agent-anatomy · 🛠️ Tools.
// Mirrors the 006/041 Experiment tools list — same store, same semantics, same
// per-conversation `enabledTools` field. Adds a count badge so the dialog
// reads "agent-shaped" (e.g. "4 of 5 enabled").

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { toolRows } from "../lib/tools";
import { useChat } from "../store/useChat";

export function ToolsSection() {
  const t = useT().agentAnatomy.tools;
  const ex = useT().settings.experiment;
  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);
  const toggleTool = useExperiment((e) => e.toggleTool);

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const allTools = config?.tools.map((tool) => tool.name) ?? [];
  const enabled = exp.enabledTools ?? allTools; // null ⇒ all on
  const count = exp.enabledTools === null ? t.countAll : t.countSome(enabled.length, allTools.length);

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
                onChange={() => toggleTool(conv, tool.name, allTools)}
                className="accent-[var(--color-accent)]"
                data-testid={`agent-anatomy-tool-${tool.name}`}
              />
              <span className={on ? "" : "text-[var(--color-muted)] line-through"}>{tool.label}</span>
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
