import { MoonIcon, SunIcon } from "./icons";
import { useT } from "../i18n";
import { useTheme } from "../lib/theme";

// Single icon toggle (was a two-pill group). The button advertises the theme it
// will switch *to* — sun while dark, moon while light — so the header carries
// one compact control instead of another competing segmented group.
export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const t = useT();

  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? t.app.themeDark : t.app.themeLight;

  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
    >
      {next === "dark" ? (
        <MoonIcon className="h-3.5 w-3.5" />
      ) : (
        <SunIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
