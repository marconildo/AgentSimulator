// 042-agent-anatomy — dialog open/close state.
//
// A tiny in-memory store. The dialog is a per-session view (it reads the
// current `useChat.activeSessionId`), but the open/close flag itself is
// global. We park it here instead of in `useSimulator` so the dialog has no
// dependency on simulator state.

import { create } from "zustand";

import type { AgentAnatomySection } from "./agentAnatomySections";

interface AgentAnatomyState {
  /** Whether the dialog is currently mounted. */
  open: boolean;
  /** Optional anchor section to scroll to when opening (e.g. ✏️ → identity). */
  initialSection: AgentAnatomySection | null;
  /** Open the dialog (optionally scrolled to a specific section). */
  openDialog: (section?: AgentAnatomySection) => void;
  /** Close the dialog. Esc / backdrop / ✕ all call this. */
  closeDialog: () => void;
}

export const useAgentAnatomy = create<AgentAnatomyState>((set) => ({
  open: false,
  initialSection: null,
  openDialog: (section) => set({ open: true, initialSection: section ?? null }),
  closeDialog: () => set({ open: false, initialSection: null }),
}));
