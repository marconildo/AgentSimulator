// 041-settings-page · The dedicated Settings view. Replaces the cramped
// popover (`SettingsPanel.tsx`) with a real page that mounts on
// `page === "settings"` in `App.tsx`. Sections are extracted siblings — see
// their own files for the lifted-out behavior.
//
// Layout: a single scrollable centred column. The page itself is the scroll
// surface, so individual sections grow with content (Skills CRUD especially).
// Order matches the popover's: Cloud → Delivery → 🧪 Experiment → 🗑️ Clear →
// 🎓 Skills. The page header is a discreet title + tagline (the gear glyph
// echoes the header toggle so the user knows where they landed).

import { SettingsIcon } from "../components/icons";
import { SkillsSettings } from "../components/SkillsSettings";
import { useT } from "../i18n";
import { isDemo } from "../lib/demo";
import { SettingsCloud } from "./SettingsCloud";
import { SettingsClear } from "./SettingsClear";
import { SettingsDelivery } from "./SettingsDelivery";
import { SettingsExperiment } from "./SettingsExperiment";

function SectionDivider() {
  return <hr className="my-5 border-0 border-t border-[var(--color-line)]" />;
}

export function SettingsPage() {
  const s = useT().settings;
  return (
    <div
      data-testid="settings-page"
      role="region"
      aria-label={s.pageTitle}
      className="flex-1 overflow-y-auto bg-[var(--color-base)]"
    >
      <div className="mx-auto max-w-3xl px-5 py-6">
        <header className="mb-5 flex items-start gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-sky-soft)]"
            aria-hidden
          >
            <SettingsIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-[var(--color-ink)]">
              {s.pageTitle}
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-muted)]">
              {s.pageTagline}
            </p>
          </div>
        </header>

        <SettingsCloud />
        <SectionDivider />
        <SettingsDelivery />
        <SectionDivider />
        <SettingsExperiment />
        {/* 058-online-demo-mode: the DB-mutating sections (Clear databases, Skills
            CRUD) have no backing store in the backend-less showcase — hide them. */}
        {!isDemo() && (
          <>
            <SectionDivider />
            <SettingsClear />
            <SectionDivider />
            <SkillsSettings />
          </>
        )}
      </div>
    </div>
  );
}
