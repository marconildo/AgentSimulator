// 041-settings-page · Cloud overlay section, lifted from the popover. Thin
// wrapper around `<CloudToggle alwaysLabels />` with the section heading.
// The model is cloud-agnostic (constitution §5); this control selects which
// concrete provider's names render on the canvas (generic / azure / aws / gcp).

import { useT } from "../i18n";
import { CloudToggle } from "../components/CloudToggle";

export function SettingsCloud() {
  const t = useT();
  return (
    <section>
      <div className="mb-2 text-[12px] font-semibold text-[var(--color-ink)]">{t.app.cloud}</div>
      <CloudToggle alwaysLabels />
    </section>
  );
}
