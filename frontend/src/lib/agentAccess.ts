// 043-persisted-agent / 044-shared-agent-catalog — `useActiveAgent`: the
// shared hook the Agent Anatomy dialog sections use to read/write the agent
// the dialog is currently editing.
//
// 064-agent-catalog-focus: the edited agent is resolved **focus-first** from the
// shared `useAgentCatalog` store, decoupled from the session binding:
//
//   focused agent (catalog.focusedId)  ??  session agent  ??  catalog default
//
// So the editor follows whatever row the user selected/created in the sidebar —
// even when the conversation's binding is locked (045). When nothing is focused
// the hook falls back to the session's bound agent (or the catalog default on a
// draft), preserving the prior 044 behavior byte-for-byte.
//
// Edits PATCH `/api/agents/{id}` with a 500 ms debounce and immediately reflect
// the result on both the catalog store (`upsert`) and any session bound to that
// agent (`replaceSession`) so the next render is consistent everywhere. The
// dialog closing or the input blurring **flushes** any pending PATCH — the same
// fix that resolved 042's "name lost on close" bug.

import { useCallback, useEffect, useRef } from "react";

import { useChat } from "../store/useChat";
import { useAgentCatalog } from "./agentCatalog";
import { patchAgent, type AgentMeta, type AgentPatchBody } from "./chatApi";

interface ActiveAgentHandle {
  /** The active agent (session's agent, or catalog default when no session). */
  agent: AgentMeta | null;
  /**
   * Schedule a PATCH with the given partial body. Subsequent calls within
   * the debounce window merge with prior pending values; the most recent
   * value of each key wins. Returns void.
   */
  updateAgent: (patch: AgentPatchBody) => void;
  /** Flush any pending PATCH immediately (call from input onBlur). */
  flush: () => void;
}

const DEBOUNCE_MS = 500;

export function useActiveAgent(): ActiveAgentHandle {
  const sessionAgent = useChat((c) => {
    const id = c.activeSessionId;
    if (!id) return null;
    return c.sessions.find((s) => s.id === id)?.agent ?? null;
  });
  const replaceSession = useChat((c) => c.replaceSession);

  // 064: the catalog store is the single source of truth for the list + focus.
  const agents = useAgentCatalog((s) => s.agents);
  const focusedId = useAgentCatalog((s) => s.focusedId);
  const refresh = useAgentCatalog((s) => s.refresh);
  const upsert = useAgentCatalog((s) => s.upsert);

  // Ensure the catalog is loaded so we can resolve a focused / default agent
  // even on a draft (no session row yet) — the catalog model treats edits as
  // global, so editing the seed default from a draft is the same as editing it
  // from a persisted conversation.
  useEffect(() => {
    if (agents === null) void refresh();
  }, [agents, refresh]);

  // Resolution order: the explicitly focused agent (a row the user selected or
  // just created) wins; otherwise the conversation's bound agent; otherwise the
  // catalog default. This is what decouples editing from the 045 session lock.
  const focusedAgent: AgentMeta | null =
    (focusedId ? agents?.find((a) => a.id === focusedId) : null) ?? null;
  const defaultAgent = agents?.find((a) => a.is_default) ?? agents?.[0] ?? null;
  const agent = focusedAgent ?? sessionAgent ?? defaultAgent;

  // Pending merge buffer + current agent id (refs so callbacks are stable).
  const pendingRef = useRef<AgentPatchBody | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentIdRef = useRef<string | null>(agent?.id ?? null);
  agentIdRef.current = agent?.id ?? null;

  const flush = useCallback(() => {
    const patch = pendingRef.current;
    const aid = agentIdRef.current;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!patch || !aid) return;
    patchAgent(aid, patch)
      .then((row) => {
        // 064: reflect the edit into the shared catalog so the editor (which
        // reads focus-first from the store) keeps showing the latest values.
        upsert(row);
        // 044-shared-agent-catalog: the agent is shared across conversations.
        // Reflect the updated row on EVERY session whose `agent.id` matches —
        // not just the active one — so other open conversations (and the chat
        // sidebar) see the change immediately, without a list refetch.
        for (const s of useChat.getState().sessions) {
          if (s.agent?.id === row.id) {
            replaceSession({ ...s, agent: row });
          }
        }
      })
      .catch(() => {
        // Quiet failure — the dialog has its own surfaces for validation
        // errors (the field stays at the typed value); a 422 keeps the row
        // unchanged on the server, and the next refresh re-syncs.
      });
  }, [replaceSession, upsert]);

  const updateAgent = useCallback(
    (patch: AgentPatchBody) => {
      // Merge into the pending buffer so two fast updates to different keys
      // ride the same PATCH (e.g. name + description in quick succession).
      pendingRef.current = { ...(pendingRef.current ?? {}), ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on unmount (dialog close mid-debounce). Matches 042's Identity fix.
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return { agent, updateAgent, flush };
}
