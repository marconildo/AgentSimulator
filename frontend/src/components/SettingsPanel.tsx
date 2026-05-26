import { useEffect, useRef, useState } from "react";

import { useT } from "../i18n";
import { type DeliveryMode, useSettings } from "../lib/settings";

// Gear button in the header that opens a small panel of architecture options.
// Today it drives the response-delivery mode (streaming SSE vs batch JSON);
// it's built to grow — future toggles (tools, RAG) are previewed as disabled.
export function SettingsPanel() {
  const mode = useSettings((s) => s.mode);
  const setMode = useSettings((s) => s.setMode);
  const t = useT();
  const s = t.settings;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options: { code: DeliveryMode; label: string; hint: string }[] = [
    { code: "stream", label: s.streaming, hint: s.streamingHint },
    { code: "batch", label: s.batch, hint: s.batchHint },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title={s.open}
        className="rounded-full border px-2.5 py-1 text-[13px] transition"
        style={{
          borderColor: open ? "#5b7cfa" : "var(--color-line)",
          color: open ? "#a5b4fc" : "var(--color-muted)",
        }}
      >
        ⚙️
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--color-line)] p-3 shadow-2xl"
          style={{ background: "color-mix(in srgb, var(--color-panel) 98%, transparent)" }}
        >
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
            <span aria-hidden>⚙️</span>
            {s.title}
          </div>

          <div className="mb-1 text-[11px] font-semibold text-[var(--color-ink)]">{s.delivery}</div>
          <p className="mb-2 text-[10.5px] leading-snug text-[var(--color-muted)]">
            {s.deliveryHint}
          </p>

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
                    borderColor: active ? "#5b7cfa" : "var(--color-line)",
                    background: active ? "var(--color-panel-2)" : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border"
                      style={{ borderColor: active ? "#7dd3fc" : "var(--color-muted)" }}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[#7dd3fc]" />}
                    </span>
                    <span
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: active ? "#a5b4fc" : "var(--color-ink)" }}
                    >
                      {o.label}
                    </span>
                  </div>
                  <p className="mt-1 pl-5 text-[10px] leading-snug text-[var(--color-muted)]">
                    {o.hint}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="my-2.5 border-t border-[var(--color-line)]" />

          {/* Previews of options to come — disabled for now. */}
          <div className="flex flex-col gap-1.5 opacity-50">
            {[s.tools, s.rag].map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-2.5 py-1.5"
              >
                <span className="text-[11px] text-[var(--color-ink)]">{label}</span>
                <span className="rounded-full border border-[var(--color-line)] px-1.5 py-px text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
                  {s.soon}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9.5px] text-[var(--color-muted)]">{s.moreSoon}</p>
        </div>
      )}
    </div>
  );
}
