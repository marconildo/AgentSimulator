// 064-agent-catalog-focus — single source of truth for the Agent Anatomy
// dialog's catalog state.
//
// The dialog edits a **focused** agent that is decoupled from the conversation's
// session binding (044/045). Before 064 the editor read the agent it edits from
// `sessions[active].agent`, so the 045 session lock leaked into the *shared*
// catalog and made every row uneditable once a conversation had messages. Here
// the focus is an explicit pointer: selecting a row, creating, or deleting all
// move the focus regardless of the session lock — only re-*binding* a started
// conversation stays locked (that lives in the sidebar / `setSessionAgent`).
//
// Both `AgentCatalogSidebar` (the list / +New / delete UI) and `useActiveAgent`
// (what the editor sections read/write) consume this store, so a freshly created
// agent is in the list and focused in the same interaction, with no reload, and
// edits reflect everywhere (one source of truth).

import { create } from "zustand";

import { listAgents, type AgentMeta } from "./chatApi";

interface AgentCatalogState {
  /** The catalog list. `null` = not loaded yet. */
  agents: AgentMeta[] | null;
  /** The agent the dialog editor is currently editing (catalog focus). */
  focusedId: string | null;
  /** (Re)fetch the catalog from the server. Swallows errors to `[]`. */
  refresh: () => Promise<void>;
  /** Set (or clear with `null`) the focused agent. */
  setFocused: (id: string | null) => void;
  /** Insert or replace a row locally (reflect a create / PATCH without refetch). */
  upsert: (row: AgentMeta) => void;
  /** Remove a row locally; clears focus if it pointed at the removed agent. */
  remove: (id: string) => void;
}

export const useAgentCatalog = create<AgentCatalogState>((set) => ({
  agents: null,
  focusedId: null,
  refresh: async () => {
    try {
      set({ agents: await listAgents() });
    } catch {
      set({ agents: [] });
    }
  },
  setFocused: (id) => set({ focusedId: id }),
  upsert: (row) =>
    set((s) => {
      const cur = s.agents ?? [];
      const idx = cur.findIndex((a) => a.id === row.id);
      if (idx === -1) return { agents: [...cur, row] };
      const next = cur.slice();
      next[idx] = row;
      return { agents: next };
    }),
  remove: (id) =>
    set((s) => ({
      agents: (s.agents ?? []).filter((a) => a.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),
}));
