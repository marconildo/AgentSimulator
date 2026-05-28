// 042-agent-anatomy · 🧱 System prompt (guardrails layer).
// 043-persisted-agent: PATCHes the agent row directly (no more in-memory
// override). The Reset button is gone because there is no longer a
// "override vs default" duality — the row IS the truth. To go back to the
// seed defaults, `clear_all` (or a future "reset agent" affordance) is the
// path; this section just edits the persisted value live.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";

export function SystemPromptSection() {
  const t = useT().agentAnatomy;
  const { agent, updateAgent, flush } = useActiveAgent();

  const [draft, setDraft] = useState<string>(agent?.system_prompt ?? "");
  useEffect(() => {
    setDraft(agent?.system_prompt ?? "");
  }, [agent?.id, agent?.system_prompt]);

  return (
    <section data-anatomy-section="system" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.system.help}</p>
      <textarea
        aria-label={t.system.title}
        data-testid="agent-anatomy-system-prompt"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          updateAgent({ system_prompt: e.target.value });
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
