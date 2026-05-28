// 042-agent-anatomy · 🧱 System prompt (guardrails layer).
// Replaces `system_prompt` (the platform-wide rules) per-conversation.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

export function SystemPromptSection() {
  const t = useT().agentAnatomy;
  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);
  const setSystemPrompt = useExperiment((e) => e.setSystemPrompt);

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const value = exp.systemPrompt ?? config?.default_system_prompt ?? "";
  const dirty = exp.systemPrompt !== null;

  return (
    <section data-anatomy-section="system" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.system.help}</p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--color-ink)]">{t.system.title}</span>
        {dirty && (
          <button
            onClick={() => setSystemPrompt(conv, null)}
            className="rounded-full border border-[var(--color-line)] px-2 py-px text-[10px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          >
            {t.reset}
          </button>
        )}
      </div>
      <textarea
        aria-label={t.system.title}
        data-testid="agent-anatomy-system-prompt"
        value={value}
        onChange={(e) => setSystemPrompt(conv, e.target.value)}
        rows={8}
        maxLength={2000}
        disabled={!config}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
    </section>
  );
}
