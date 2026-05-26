// Lightweight i18n layer. No extra dependencies — it reuses Zustand (already a
// project dependency) for a tiny language store, persists the choice to
// localStorage, and exposes the current-language UI string dictionary.

import { create } from "zustand";

import { UI } from "./strings";

export type Lang = "en" | "pt";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "pt", label: "PT", flag: "🇧🇷" },
];

const STORAGE_KEY = "agentsim.lang";
const DEFAULT_LANG: Lang = "en";

function initialLang(): Lang {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "pt") return saved;
  }
  return DEFAULT_LANG;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, lang);
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    set({ lang });
  },
}));

// Keep <html lang> in sync with the persisted choice on first load.
if (typeof document !== "undefined") document.documentElement.lang = initialLang();

/** Hook returning the chrome-string dictionary for the active language. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return UI[lang];
}
