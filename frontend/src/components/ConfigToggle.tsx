// 041-settings-page · The header's ⚙️ Config button. Replaces the popover
// `SettingsPanel`: this navigates instead of opening a dropdown — clicking
// when off-page goes to `page = "settings"`; clicking when on-page goes back
// to `page = "sim"`. Mirrors the existing Learn-button toggle pattern exactly
// (`Book ↔ Back` icons + label flip), so a user knows where they are at a glance.

import { BackIcon, SettingsIcon } from "./icons";
import { useT } from "../i18n";
import type { Page } from "../lib/page";

interface ConfigToggleProps {
  page: Page;
  setPage: (page: Page) => void;
}

export function ConfigToggle({ page, setPage }: ConfigToggleProps) {
  const t = useT();
  const active = page === "settings";
  const onClick = () => setPage(active ? "sim" : "settings");

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={active ? t.settings.backToSim : t.settings.open}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
      style={{
        borderColor: active ? "var(--color-sky)" : "var(--color-line)",
        color: active ? "var(--color-sky-soft)" : "var(--color-text-soft)",
      }}
    >
      {active ? <BackIcon className="h-3.5 w-3.5" /> : <SettingsIcon className="h-3.5 w-3.5" />}
      <span className="hidden lg:inline">{active ? t.app.simulator : t.app.config}</span>
    </button>
  );
}
