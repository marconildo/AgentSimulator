// Theme overlay (dark / light). Mirrors the i18n language store and lib/cloud.ts:
// a tiny Zustand store persisted to localStorage. Switching the theme just sets
// `document.documentElement.dataset.theme`; every surface reads `var(--color-*)`
// tokens (see index.css), so the whole UI recolors with no manual re-render.
// Default is "dark" — today's look — when nothing is stored.

import { create } from "zustand";

export type ThemeId = "dark" | "light";

export const THEMES: { code: ThemeId; label: string; icon: string }[] = [
  { code: "light", label: "Light", icon: "☀️" },
  { code: "dark", label: "Dark", icon: "🌙" },
];

const STORAGE_KEY = "agentsim.theme";
const DEFAULT_THEME: ThemeId = "dark";

export function isTheme(v: unknown): v is ThemeId {
  return v === "dark" || v === "light";
}

export function initialTheme(): ThemeId {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  }
  return DEFAULT_THEME;
}

/** Reflect the chosen theme on <html data-theme>, driving the CSS token overrides. */
function applyTheme(theme: ThemeId) {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));

// Apply the persisted choice once at module load, like the language store.
applyTheme(initialTheme());
