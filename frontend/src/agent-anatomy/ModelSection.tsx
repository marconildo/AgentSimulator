// 042-agent-anatomy · 🧠 Model picker.
// 043-persisted-agent: writes `agents.model` directly. The dropdown lists the
// curated /api/config.models; the agent's row always carries a non-empty model.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";
import { getConfig, getOpenAIModels, type AppConfig } from "../lib/chatApi";

export function ModelSection() {
  const t = useT().agentAnatomy.model;
  const { agent, updateAgent } = useActiveAgent();

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  // 078-openai-key-ui: list the account's chat models live (when a key is set);
  // fall back to the curated list when offline / no key.
  const [liveModels, setLiveModels] = useState<{ id: string }[] | null>(null);
  useEffect(() => {
    if (agent?.provider === "ollama") return;
    getOpenAIModels()
      .then((r) => setLiveModels(r.reachable ? r.models : null))
      .catch(() => setLiveModels(null));
  }, [agent?.provider]);

  const curated = config?.models ?? [];
  const value = agent?.model ?? "";
  // Prefer the live list; else curated. Ensure the current value is always an
  // option so the select reflects the agent's model even if it's not listed.
  const live = liveModels && liveModels.length > 0;
  const models: { id: string; label: string }[] = live
    ? liveModels.map((m) => ({ id: m.id, label: m.id }))
    : curated.map((m) => ({ id: m.id, label: m.label }));
  if (value && !models.some((m) => m.id === value)) {
    models.unshift({ id: value, label: value });
  }

  // 074-ollama-provider: for an Ollama-bound agent the model is chosen from the
  // live local-server list in the Provider section (this curated list is
  // OpenAI-only). Point the user there instead of showing OpenAI models.
  if (agent?.provider === "ollama") {
    return (
      <section data-anatomy-section="model" className="space-y-2">
        <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>
        <p className="text-[11px] text-[var(--color-muted)]">
          {t.resolved}{" "}
          <span className="font-mono text-[var(--color-ink)]">{value || "—"}</span>
        </p>
      </section>
    );
  }

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
            {m.label === m.id ? m.id : `${m.label} — ${m.id}`}
          </option>
        ))}
      </select>
      <p className="text-[10.5px] text-[var(--color-muted)]">
        {t.resolved} <span className="font-mono text-[var(--color-ink)]">{value || "—"}</span>
      </p>
    </section>
  );
}
