// The model the ACTIVE conversation will run on — the single source of truth for
// any "model used" display (the LLM Inspector field, the composer cost estimate).
//
// 074-ollama-provider follow-up: model + provider are per-agent now, so these
// displays must track the SELECTED agent, not the server default. We resolve the
// active session's bound agent (or the `draftAgent` on a not-yet-created chat) and
// fall back to the live `/api/health` default only when no agent is resolvable.

import type { AgentMeta, SessionMeta } from "./chatApi";
import { useAgentCatalog } from "./agentCatalog";
import { useHealth } from "./health";
import { useChat } from "../store/useChat";

interface ChatSlice {
  activeSessionId: string | null;
  sessions: SessionMeta[];
  draftAgent: AgentMeta | null;
}

/** The agent the active conversation uses: the active session's agent, else the
 *  draft agent (a chat not yet persisted), else null. */
export function pickActiveAgent(c: ChatSlice): AgentMeta | null {
  if (c.activeSessionId) {
    return c.sessions.find((s) => s.id === c.activeSessionId)?.agent ?? null;
  }
  return c.draftAgent;
}

/** The active model + provider, falling back to the server default model when no
 *  agent is bound (provider is null in that case — there's no agent to read it from).
 *
 *  ``catalog`` (optional) is the shared agent catalog: when the inlined session/draft
 *  agent is stale (the dialog just edited it), the catalog has the freshest row, so we
 *  prefer the catalog entry with the same id. This keeps the header model in sync with
 *  an edit even on a not-yet-sent draft. */
export function resolveActiveModel(
  c: ChatSlice,
  fallbackModel: string | null,
  catalog?: AgentMeta[] | null,
): { model: string | null; provider: string | null } {
  const inlined = pickActiveAgent(c);
  const fresh =
    inlined && catalog ? catalog.find((a) => a.id === inlined.id) ?? inlined : inlined;
  return {
    model: fresh?.model ?? fallbackModel,
    provider: fresh?.provider ?? null,
  };
}

/** Hook form: re-renders when the active agent, the catalog, or the health default changes. */
export function useActiveModel(): { model: string | null; provider: string | null } {
  const fallback = useHealth((s) => s.llmModel);
  const activeSessionId = useChat((s) => s.activeSessionId);
  const sessions = useChat((s) => s.sessions);
  const draftAgent = useChat((s) => s.draftAgent);
  const catalog = useAgentCatalog((s) => s.agents);
  return resolveActiveModel({ activeSessionId, sessions, draftAgent }, fallback, catalog);
}
