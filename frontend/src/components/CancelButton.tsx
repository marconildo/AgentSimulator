import { useT } from "../i18n";
import { useChat } from "../store/useChat";

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="1.6" />
    </svg>
  );
}

// 016-cancel-stream: the in-flight cancel control. Present only while a chat run
// is actually streaming (`sending`); absent — and a no-op — otherwise (AC1). A
// click aborts the run and settles the UI into a clean cancelled state (AC2).
export function CancelButton() {
  const t = useT();
  const sending = useChat((s) => s.sending);
  const cancel = useChat((s) => s.cancel);
  if (!sending) return null;
  return (
    <button
      type="button"
      onClick={() => cancel()}
      aria-label={t.chat.cancel}
      title={t.chat.cancel}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-rose-soft)] transition hover:bg-[color-mix(in_srgb,var(--color-rose)_14%,transparent)] active:scale-95"
    >
      <StopIcon className="h-3 w-3" />
      {t.chat.cancel}
    </button>
  );
}
