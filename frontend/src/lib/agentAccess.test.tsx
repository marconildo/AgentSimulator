// 064-agent-catalog-focus — `useActiveAgent` resolves the edited agent
// **focus-first** from the shared catalog store, decoupled from the session
// binding, and PATCHes that focused agent's id. Covers AC6.

/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./chatApi", () => ({
  listAgents: vi.fn(),
  patchAgent: vi.fn(),
}));

import * as chatApi from "./chatApi";
import type { AgentMeta } from "./chatApi";
import { useActiveAgent } from "./agentAccess";
import { useAgentCatalog } from "./agentCatalog";
import { useChat } from "../store/useChat";

const agent = (id: string, name: string, isDefault = false): AgentMeta => ({
  id,
  name,
  description: "",
  system_prompt: "g",
  agent_prompt: "a",
  model: "gpt-4o-mini",
  enabled_tools: [],
  is_default: isDefault,
  created_at: 0,
  updated_at: 0,
});

const ALICE = agent("a1", "Alice", true);
const BOB = agent("a2", "Bob");

beforeEach(() => {
  vi.clearAllMocks();
  useAgentCatalog.setState({ agents: null, focusedId: null });
  // A locked conversation bound to Alice — the editor must still be able to
  // edit a *different* focused agent (Bob).
  useChat.setState((prev) => ({
    ...prev,
    activeSessionId: "s1",
    sessions: [
      {
        id: "s1",
        title: "T",
        created_at: 0,
        updated_at: 0,
        message_count: 3,
        agent: ALICE,
      },
    ],
    messages: [],
  }));
  vi.mocked(chatApi.listAgents).mockResolvedValue([ALICE, BOB]);
  vi.mocked(chatApi.patchAgent).mockImplementation(async (id, body) => ({
    ...(id === ALICE.id ? ALICE : BOB),
    ...body,
  }));
});

afterEach(() => cleanup());

describe("useActiveAgent — focus-first resolution (064)", () => {
  it("edits the focused agent's id, not the session agent (AC6)", async () => {
    const { result } = renderHook(() => useActiveAgent());

    // Catalog loads; with no focus, falls back to the session's bound agent.
    await waitFor(() => expect(result.current.agent?.id).toBe(ALICE.id));

    // Focus Bob — the editor now follows Bob even though the session is locked.
    act(() => useAgentCatalog.getState().setFocused(BOB.id));
    await waitFor(() => expect(result.current.agent?.id).toBe(BOB.id));

    // Editing PATCHes Bob's id…
    act(() => result.current.updateAgent({ name: "Bobby" }));
    act(() => result.current.flush());

    await waitFor(() => {
      expect(chatApi.patchAgent).toHaveBeenCalledWith(BOB.id, { name: "Bobby" });
    });
    // …and the edit is reflected into the shared catalog store.
    await waitFor(() => {
      const row = useAgentCatalog.getState().agents?.find((a) => a.id === BOB.id);
      expect(row?.name).toBe("Bobby");
    });
  });
});
