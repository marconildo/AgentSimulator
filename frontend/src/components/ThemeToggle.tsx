import { useT } from "../i18n";
import { THEMES, useTheme } from "../lib/theme";

// Compact dark/light switch in the header, alongside the language and cloud
// toggles. The choice is persisted to localStorage by the theme store, which
// also sets <html data-theme> so every var(--color-*) surface recolors.
export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const t = useT();

  const labelFor = (code: string) => (code === "dark" ? t.app.themeDark : t.app.themeLight);

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--color-line)] p-0.5"
      role="group"
      aria-label={t.app.theme}
      title={t.app.theme}
    >
      {THEMES.map(({ code, icon }) => {
        const active = theme === code;
        return (
          <button
            key={code}
            onClick={() => setTheme(code)}
            aria-pressed={active}
            aria-label={labelFor(code)}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition"
            style={{
              background: active ? "var(--color-panel-2)" : "transparent",
              border: `1px solid ${active ? "var(--color-sky)" : "transparent"}`,
              color: active ? "var(--color-sky-soft)" : "var(--color-muted)",
            }}
          >
            <span className="mr-1" aria-hidden>
              {icon}
            </span>
            {labelFor(code)}
          </button>
        );
      })}
    </div>
  );
}
