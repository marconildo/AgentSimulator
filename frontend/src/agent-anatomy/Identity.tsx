// 042-agent-anatomy · 🪪 Identity section.
// 043-persisted-agent: name AND description now persist in the `agents` table.
// Edits PATCH /api/agents/{id} via the shared `useActiveAgent` hook (debounced
// 500 ms, flushed on blur + on dialog close — the 042 unmount-flush bug fix).

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";

export function Identity() {
  const t = useT().agentAnatomy.identity;
  const { agent, updateAgent, flush } = useActiveAgent();

  // Local drafts shadow the row so the input is responsive while we debounce
  // the PATCH; switching conversations or refetches sync them back.
  const [nameDraft, setNameDraft] = useState<string>(agent?.name ?? "");
  const [descDraft, setDescDraft] = useState<string>(agent?.description ?? "");

  useEffect(() => {
    setNameDraft(agent?.name ?? "");
    setDescDraft(agent?.description ?? "");
  }, [agent?.id, agent?.name, agent?.description]);

  return (
    <section data-anatomy-section="identity" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.hint}</p>

      <div>
        <label
          htmlFor="agent-anatomy-name"
          className="mb-1 block text-[11px] font-semibold text-[var(--color-ink)]"
        >
          {t.nameLabel}
        </label>
        <input
          id="agent-anatomy-name"
          aria-label={t.nameLabel}
          data-testid="agent-anatomy-name-input"
          value={nameDraft}
          onChange={(e) => {
            const next = e.target.value.slice(0, 60);
            setNameDraft(next);
            updateAgent({ name: next });
          }}
          onBlur={flush}
          maxLength={60}
          placeholder={t.namePlaceholder}
          spellCheck={false}
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <div>
        <label
          htmlFor="agent-anatomy-desc"
          className="mb-1 block text-[11px] font-semibold text-[var(--color-ink)]"
        >
          {t.descLabel}
        </label>
        <textarea
          id="agent-anatomy-desc"
          aria-label={t.descLabel}
          data-testid="agent-anatomy-desc-input"
          value={descDraft}
          onChange={(e) => {
            const next = e.target.value.slice(0, 240);
            setDescDraft(next);
            updateAgent({ description: next });
          }}
          onBlur={flush}
          maxLength={240}
          rows={2}
          placeholder={t.descPlaceholder}
          spellCheck={false}
          className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    </section>
  );
}
