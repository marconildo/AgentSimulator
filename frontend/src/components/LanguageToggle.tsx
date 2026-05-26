import { LANGS, useLang, useT } from "../i18n";

// Compact EN/PT switch shown in the top-right corner of the header. Lets the
// visitor pick the language they want to study the simulator in; the choice is
// persisted to localStorage by the language store.
export function LanguageToggle() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--color-line)] p-0.5"
      role="group"
      aria-label={t.app.language}
      title={t.app.language}
    >
      <span className="pl-1.5 pr-0.5 text-[11px] leading-none" aria-hidden>
        🌐
      </span>
      {LANGS.map(({ code, label, flag }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            onClick={() => setLang(code)}
            aria-pressed={active}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition"
            style={{
              background: active ? "var(--color-panel-2)" : "transparent",
              borderColor: active ? "#38bdf8" : "transparent",
              border: `1px solid ${active ? "#38bdf8" : "transparent"}`,
              color: active ? "#7dd3fc" : "var(--color-muted)",
            }}
          >
            <span className="mr-1" aria-hidden>
              {flag}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
