// 042-agent-anatomy · 🎭 Agent prompt (role layer).
// Replaces `agent_prompt` (this agent's identity / instructions) per-conversation.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

export function AgentPromptSection() {
  const t = useT().agentAnatomy;
  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);
  const setAgentPrompt = useExperiment((e) => e.setAgentPrompt);

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const value = exp.agentPrompt ?? config?.default_agent_prompt ?? "";
  const dirty = exp.agentPrompt !== null;

  return (
    <section data-anatomy-section="agent" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.agent.help}</p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--color-ink)]">{t.agent.title}</span>
        {dirty && (
          <button
            onClick={() => setAgentPrompt(conv, null)}
            className="rounded-full border border-[var(--color-line)] px-2 py-px text-[10px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          >
            {t.reset}
          </button>
        )}
      </div>
      <textarea
        aria-label={t.agent.title}
        data-testid="agent-anatomy-agent-prompt"
        value={value}
        onChange={(e) => setAgentPrompt(conv, e.target.value)}
        rows={8}
        maxLength={2000}
        disabled={!config}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
    </section>
  );
}
