import { useT } from "../i18n";
import { CLOUDS, useCloud } from "../lib/cloud";

// Compact provider switch in the header (Generic · Azure · AWS · GCP). The
// architecture is cloud-agnostic; this overlay swaps the concrete example
// service names shown on tiers, stations and the network boundary. Mirrors the
// LanguageToggle; the choice is persisted to localStorage by the cloud store.
export function CloudToggle() {
  const cloud = useCloud((s) => s.cloud);
  const setCloud = useCloud((s) => s.setCloud);
  const t = useT();

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--color-line)] p-0.5"
      role="group"
      aria-label={t.app.cloud}
      title={t.app.cloud}
    >
      {CLOUDS.map(({ code, label, icon }) => {
        const active = cloud === code;
        return (
          <button
            key={code}
            onClick={() => setCloud(code)}
            aria-pressed={active}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition"
            style={{
              background: active ? "var(--color-panel-2)" : "transparent",
              border: `1px solid ${active ? "var(--color-accent)" : "transparent"}`,
              color: active ? "var(--color-indigo-soft)" : "var(--color-muted)",
            }}
          >
            <span className="mr-1" aria-hidden>
              {icon}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
