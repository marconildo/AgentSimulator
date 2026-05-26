// Architecture options the visitor can toggle. Today just the response
// delivery mode (how the backend returns the result); kept in its own tiny
// Zustand store — persisted to localStorage — so it's easy to grow. Mirrors the
// cloud/language stores.

import { create } from "zustand";

// "stream": SSE — trace + answer arrive live, token by token.
// "batch":  one JSON response after the run finishes; the client replays it.
export type DeliveryMode = "stream" | "batch";

const STORAGE_KEY = "agentsim.delivery";
const DEFAULT_MODE: DeliveryMode = "stream";

function isMode(v: unknown): v is DeliveryMode {
  return v === "stream" || v === "batch";
}

function initialMode(): DeliveryMode {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isMode(saved)) return saved;
  }
  return DEFAULT_MODE;
}

interface SettingsState {
  mode: DeliveryMode;
  setMode: (mode: DeliveryMode) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  mode: initialMode(),
  setMode: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },
}));
