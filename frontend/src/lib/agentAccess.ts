// 043-persisted-agent / 044-shared-agent-catalog — `useActiveAgent`: the
// shared hook the Agent Anatomy dialog sections use to read/write the active
// conversation's agent row.
//
// One source of truth: the agent comes from `useChat.sessions[active].agent`.
// 044-bugfix: when there's no active session (draft), the hook **falls back**
// to the catalog's default agent — edits PATCH the shared default and
// propagate to every conversation. This matches the catalog model: every
// conversation lives off shared rows.
//
// Edits PATCH `/api/agents/{id}` with a 500 ms debounce and immediately
// reflect the result on the in-memory store (via `replaceSession`) so the
// next render is consistent. The dialog closing or the input blurring
// **flushes** any pending PATCH — the same fix that resolved 042's
// "name lost on close" bug.

import { useCallback, useEffect, useRef, useState } from "react";

import { useChat } from "../store/useChat";
import { listAgents, patchAgent, type AgentMeta, type AgentPatchBody } from "./chatApi";

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

  // Fallback path: when the user is on a draft (no session row yet) we still
  // want the dialog to *work* — the catalog model treats edits as global, so
  // editing the seed default from a draft is the same as editing it from a
  // persisted conversation. We fetch the default once and reuse it as the
  // active agent until a session-bound agent shows up.
  const [defaultAgent, setDefaultAgent] = useState<AgentMeta | null>(null);
  useEffect(() => {
    if (sessionAgent || defaultAgent) return;
    let cancelled = false;
    listAgents()
      .then((rows) => {
        if (cancelled) return;
        const def = rows.find((a) => a.is_default) ?? rows[0] ?? null;
        setDefaultAgent(def);
      })
      .catch(() => {
        // Quiet — the dialog stays in its initial empty state; the next
        // session-aware render will recover.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionAgent, defaultAgent]);

  const agent = sessionAgent ?? defaultAgent;

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
        // 044-shared-agent-catalog: the agent is shared across conversations.
        // Reflect the updated row on EVERY session whose `agent.id` matches —
        // not just the active one — so other open conversations (and the chat
        // sidebar) see the change immediately, without a list refetch.
        for (const s of useChat.getState().sessions) {
          if (s.agent?.id === row.id) {
            replaceSession({ ...s, agent: row });
          }
        }
        // Also refresh the local fallback so the draft path picks up the
        // freshly-edited row on the next render.
        setDefaultAgent((cur) => (cur && cur.id === row.id ? row : cur));
      })
      .catch(() => {
        // Quiet failure — the dialog has its own surfaces for validation
        // errors (the field stays at the typed value); a 422 keeps the row
        // unchanged on the server, and the next refresh re-syncs.
      });
  }, [replaceSession]);

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
