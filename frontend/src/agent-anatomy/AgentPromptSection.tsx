// 042-agent-anatomy · 🎭 Agent prompt (role layer).
// 043-persisted-agent: PATCHes `agents.agent_prompt` via `useActiveAgent`.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";

export function AgentPromptSection() {
  const t = useT().agentAnatomy;
  const { agent, updateAgent, flush } = useActiveAgent();

  const [draft, setDraft] = useState<string>(agent?.agent_prompt ?? "");
  useEffect(() => {
    setDraft(agent?.agent_prompt ?? "");
  }, [agent?.id, agent?.agent_prompt]);

  return (
    <section data-anatomy-section="agent" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.agent.help}</p>
      <textarea
        aria-label={t.agent.title}
        data-testid="agent-anatomy-agent-prompt"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          updateAgent({ agent_prompt: e.target.value });
        }}
        onBlur={flush}
        rows={8}
        maxLength={2000}
        disabled={!agent}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
    </section>
  );
}
