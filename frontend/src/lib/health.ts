// Live backend health, probed once at startup. Two jobs: it is the single
// source of truth for the running model (so the LLM block never hardcodes one —
// B2), and it drives the offline / missing-key banner (B9). Mirrors the other
// tiny Zustand stores; no persistence — it's a live probe, not a preference.

import { create } from "zustand";

import { demoHealth, isDemo } from "./demo";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export type HealthStatus = "loading" | "ok" | "down";

interface HealthState {
  status: HealthStatus;
  llmProvider: string | null;
  llmModel: string | null;
  hasKey: boolean | null;
  load: () => Promise<void>;
}

export const useHealth = create<HealthState>((set) => ({
  status: "loading",
  llmProvider: null,
  llmModel: null,
  hasKey: null,
  load: async () => {
    // 058-online-demo-mode: a backend-less build reports a healthy keyed model so
    // the offline/no-key banner never shows; everything else is replayed fixtures.
    if (isDemo()) {
      set(demoHealth());
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      const h = await res.json();
      set({
        status: "ok",
        llmProvider: h.llm_provider ?? null,
        llmModel: h.llm_model ?? null,
        hasKey: typeof h.has_key === "boolean" ? h.has_key : null,
      });
    } catch {
      set({ status: "down", llmProvider: null, llmModel: null, hasKey: null });
    }
  },
}));

// What persistent banner (if any) the header should show. A pure projection of
// the probe so it's trivially testable: the backend is unreachable, or it is up
// but reports no OpenAI key (the app can't actually run a turn). "loading" and a
// healthy keyed backend show nothing.
export type HealthBanner = "offline" | "no-key" | null;

export function healthBanner(status: HealthStatus, hasKey: boolean | null): HealthBanner {
  if (status === "down") return "offline";
  if (status === "ok" && hasKey === false) return "no-key";
  return null;
}
