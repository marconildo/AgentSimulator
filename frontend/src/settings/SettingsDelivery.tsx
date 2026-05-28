// 041-settings-page · Response delivery section, lifted out of the popover
// `SettingsPanel.tsx`. Behavior unchanged: two radio-style buttons writing
// `useSettings.mode` (Streaming SSE vs Batch JSON).

import { useT } from "../i18n";
import { type DeliveryMode, useSettings } from "../lib/settings";

export function SettingsDelivery() {
  const mode = useSettings((s) => s.mode);
  const setMode = useSettings((s) => s.setMode);
  const s = useT().settings;

  const options: { code: DeliveryMode; label: string; hint: string }[] = [
    { code: "stream", label: s.streaming, hint: s.streamingHint },
    { code: "batch", label: s.batch, hint: s.batchHint },
  ];

  return (
    <section>
      <div className="mb-1 text-[12px] font-semibold text-[var(--color-ink)]">{s.delivery}</div>
      <p className="mb-2 text-[11px] leading-snug text-[var(--color-muted)]">{s.deliveryHint}</p>

      <div className="flex flex-col gap-1.5">
        {options.map((o) => {
          const active = mode === o.code;
          return (
            <button
              key={o.code}
              onClick={() => setMode(o.code)}
              aria-pressed={active}
              className="rounded-lg border px-2.5 py-2 text-left transition"
              style={{
                borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                background: active ? "var(--color-panel-2)" : "transparent",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border"
                  style={{
                    borderColor: active ? "var(--color-sky-soft)" : "var(--color-muted)",
                  }}
                >
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-sky-soft)]" />
                  )}
                </span>
                <span
                  className="font-mono text-[11.5px] font-semibold"
                  style={{ color: active ? "var(--color-indigo-soft)" : "var(--color-ink)" }}
                >
                  {o.label}
                </span>
              </div>
              <p className="mt-1 pl-5 text-[10.5px] leading-snug text-[var(--color-muted)]">
                {o.hint}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
