// 042-agent-anatomy · 🧠 Model picker.
// 043-persisted-agent: writes `agents.model` directly. The dropdown lists the
// curated /api/config.models; the agent's row always carries a non-empty model.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";
import { getConfig, type AppConfig } from "../lib/chatApi";

export function ModelSection() {
  const t = useT().agentAnatomy.model;
  const { agent, updateAgent } = useActiveAgent();

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const models = config?.models ?? [];
  const value = agent?.model ?? "";

  return (
    <section data-anatomy-section="model" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>
      <select
        aria-label={t.title}
        data-testid="agent-anatomy-model-select"
        value={value}
        disabled={!config || !agent}
        onChange={(e) => updateAgent({ model: e.target.value })}
        className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.id}
          </option>
        ))}
      </select>
      <p className="text-[10.5px] text-[var(--color-muted)]">
        {t.resolved} <span className="font-mono text-[var(--color-ink)]">{value || "—"}</span>
      </p>
    </section>
  );
}
