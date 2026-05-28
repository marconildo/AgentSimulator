// 042-agent-anatomy · 🧠 Model picker.
// Dropdown of curated OpenAI chat models from /api/config; selecting one sets
// the per-conversation override (validated server-side against the allowlist).

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

export function ModelSection() {
  const t = useT().agentAnatomy.model;
  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);
  const setModel = useExperiment((e) => e.setModel);

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const models = config?.models ?? [];
  const defaultModel = config?.default_model ?? "";
  // The dropdown reflects the override when set, the server default otherwise.
  const value = exp.model ?? defaultModel;
  const dirty = exp.model !== null;

  return (
    <section data-anatomy-section="model" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>
      <select
        aria-label={t.title}
        data-testid="agent-anatomy-model-select"
        value={value}
        disabled={!config}
        onChange={(e) => {
          const next = e.target.value;
          setModel(conv, next === defaultModel ? null : next);
        }}
        className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.id}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-between text-[10.5px] text-[var(--color-muted)]">
        <span>
          {t.resolved} <span className="font-mono text-[var(--color-ink)]">{value || "—"}</span>
        </span>
        {dirty && (
          <button
            onClick={() => setModel(conv, null)}
            className="rounded-full border border-[var(--color-line)] px-2 py-px text-[10px] transition hover:text-[var(--color-ink)]"
          >
            {t.useDefault}
          </button>
        )}
      </div>
    </section>
  );
}
