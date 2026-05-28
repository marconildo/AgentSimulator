// 043-persisted-agent — `useActiveAgent`: the shared hook the Agent Anatomy
// dialog's sections use to read/write the current conversation's agent row.
//
// One source of truth: the agent comes from `useChat.sessions[active].agent`.
// Edits PATCH `/api/agents/{id}` with a 500 ms debounce and immediately
// reflect the result on the in-memory store (via `replaceSession`) so the
// next render is consistent. The dialog closing or the input blurring
// **flushes** any pending PATCH — the same fix that resolved 042's
// "name lost on close" bug.

import { useCallback, useEffect, useRef } from "react";

import { useChat } from "../store/useChat";
import { patchAgent, type AgentMeta, type AgentPatchBody } from "./chatApi";

interface ActiveAgentHandle {
  /** The session's agent row, or null when none is active (draft conv). */
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
  const sessionId = useChat((c) => c.activeSessionId);
  const agent = useChat((c) => {
    const id = c.activeSessionId;
    if (!id) return null;
    return c.sessions.find((s) => s.id === id)?.agent ?? null;
  });
  const replaceSession = useChat((c) => c.replaceSession);

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
        // Reflect the agent's new state in every consumer (the chat sidebar,
        // the Agent station header, the dialog's prefilled values).
        const sid = sessionId;
        if (!sid) return;
        // Find the session and merge the updated agent in. We don't have a
        // full SessionMeta here — `replaceSession` does a shallow merge.
        const current = useChat.getState().sessions.find((s) => s.id === sid);
        if (current) replaceSession({ ...current, agent: row });
      })
      .catch(() => {
        // Quiet failure — the dialog has its own surfaces for validation
        // errors (the field stays at the typed value); a 422 keeps the row
        // unchanged on the server, and the next refresh re-syncs.
      });
  }, [replaceSession, sessionId]);

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
