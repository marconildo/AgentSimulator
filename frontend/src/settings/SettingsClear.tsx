// 041-settings-page · 🗑️ Clear-databases section, lifted from the popover.
// Same behavior: inline confirm step, then `useChat.clearAll()`, then a
// success line with the returned counts. The component owns its tiny
// confirming / clearing / cleared local state.

import { useState } from "react";

import { useT } from "../i18n";
import { type ClearResult } from "../lib/chatApi";
import { useChat } from "../store/useChat";

export function SettingsClear() {
  const s = useT().settings.data;
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState<ClearResult | null>(null);

  const doClear = async () => {
    setClearing(true);
    const result = await useChat.getState().clearAll();
    setClearing(false);
    setConfirming(false);
    if (result) setCleared(result);
  };

  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
        <span aria-hidden>🗑️</span>
        {s.title}
      </div>
      <p className="mb-2 text-[10.5px] leading-snug text-[var(--color-muted)]">{s.clearHint}</p>

      {!confirming ? (
        <button
          onClick={() => {
            setConfirming(true);
            setCleared(null);
          }}
          className="w-full rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-semibold transition"
          style={{ borderColor: "var(--color-line)", color: "var(--color-rose-soft)" }}
        >
          {s.clear}
        </button>
      ) : (
        <div
          className="rounded-lg border p-2.5"
          style={{ borderColor: "var(--color-rose-soft)", background: "var(--color-panel-2)" }}
        >
          <div className="mb-1 text-[11px] font-semibold text-[var(--color-ink)]">{s.confirm}</div>
          <p className="mb-2 text-[10.5px] leading-snug text-[var(--color-muted)]">
            {s.confirmHint}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => void doClear()}
              disabled={clearing}
              className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-60"
              style={{ borderColor: "var(--color-rose-soft)", color: "var(--color-rose-soft)" }}
            >
              {clearing ? s.clearing : s.confirmYes}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11px] text-[var(--color-muted)] transition disabled:opacity-60"
            >
              {s.cancel}
            </button>
          </div>
        </div>
      )}

      {cleared && (
        <p className="mt-1.5 text-[10.5px] font-medium text-[var(--color-ok-soft)]">
          {s.cleared
            .replace("{sessions}", String(cleared.sessions_deleted))
            .replace("{chunks}", String(cleared.vectors_removed))}
        </p>
      )}
    </section>
  );
}
