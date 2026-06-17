// 065-provider-and-model-refresh · 🔌 Provider picker.
// Reads /api/config.providers so the provider names are never hardcoded. OpenAI
// is the one active provider (selected); Ollama is a disabled preview — a
// labelled "coming soon" option that cannot be chosen (constitution §3: a
// preview draws a box, it never runs). The provider is not persisted on the
// agent: there is exactly one usable provider, so there is nothing to store.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";

export function ProviderSection() {
  const t = useT().agentAnatomy.provider;

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const providers = config?.providers ?? [];
  const selected = config?.default_provider ?? "openai";

  return (
    <section data-anatomy-section="provider" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>
      <div className="space-y-1.5">
        {providers.map((p) => (
          <label
            key={p.id}
            className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-[12px] ${
              p.available
                ? "border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-ink)]"
                : "cursor-not-allowed border-dashed border-[var(--color-line)] bg-transparent text-[var(--color-muted)]"
            }`}
          >
            <input
              type="radio"
              name="agent-anatomy-provider"
              data-testid={`agent-anatomy-provider-${p.id}`}
              value={p.id}
              checked={selected === p.id}
              disabled={!p.available}
              readOnly
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                {p.label}
                {!p.available && (
                  <span className="rounded-full border border-[var(--color-line)] px-1.5 py-px text-[9.5px] uppercase tracking-wide text-[var(--color-muted)]">
                    {t.comingSoon}
                  </span>
                )}
              </span>
              <span className="text-[10.5px] leading-snug">
                {p.available ? t.activeNote : t.previewNote}
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
