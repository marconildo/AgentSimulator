import { useT } from "../i18n";
import { CLOUDS, useCloud } from "../lib/cloud";
import { CLOUD_ICONS } from "../lib/cloudIcons";

// Compact provider switch (Generic · Azure · AWS · GCP). The architecture is
// cloud-agnostic; this overlay swaps the concrete example service names shown on
// tiers, stations and the network boundary. Rendered as a tight segmented
// control. In the header the provider *labels* collapse to icon-only below `xl`
// to stay responsive; inside the ⚙ menu (`alwaysLabels`) they always show, since
// the header hides this control entirely on narrow screens and relocates it here.
export function CloudToggle({ alwaysLabels = false }: { alwaysLabels?: boolean }) {
  const cloud = useCloud((s) => s.cloud);
  const setCloud = useCloud((s) => s.setCloud);
  const t = useT();

  return (
    <div
      className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-0.5"
      role="group"
      aria-label={t.app.cloud}
      title={t.app.cloud}
    >
      {CLOUDS.map(({ code, label }) => {
        const active = cloud === code;
        const Icon = CLOUD_ICONS[code];
        return (
          <button
            key={code}
            onClick={() => setCloud(code)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium leading-none transition ${
              active
                ? "bg-[var(--color-panel)] text-[var(--color-indigo-soft)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            <Icon className="text-sm" />
            <span className={alwaysLabels ? "inline" : "hidden xl:inline"}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
