import { LANGS, useLang, useT } from "../i18n";

// Single button showing the current language (flag + code); clicking flips
// EN ↔ PT. Was a two-pill group — collapsed to keep the header preferences
// compact and visually distinct from the segmented "view" controls.
export function LanguageToggle() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const next = lang === "en" ? "pt" : "en";

  return (
    <button
      onClick={() => setLang(next)}
      aria-label={t.app.language}
      title={t.app.language}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
    >
      <span aria-hidden className="text-[12px] leading-none">{current.flag}</span>
      {current.label}
    </button>
  );
}
