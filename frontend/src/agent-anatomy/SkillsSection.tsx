// 042-agent-anatomy · 🎓 Skills.
// Re-uses the existing 027 <SkillsSettings /> CRUD component, with a callout
// flagging that the catalog is **global** (not per-conversation, unlike the
// other sections of the dialog).

import { useT } from "../i18n";
import { SkillsSettings } from "../components/SkillsSettings";

export function SkillsSection() {
  const t = useT().agentAnatomy.skills;
  return (
    <section data-anatomy-section="skills" className="space-y-2">
      <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--color-muted)]">
        ℹ️ {t.sharedNote}
      </p>
      <SkillsSettings />
    </section>
  );
}
