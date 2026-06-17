// 064-agent-catalog-focus — creating and deleting move the dialog's edit-focus
// regardless of the 045 session lock; re-binding the conversation's agent only
// happens when the conversation isn't locked. Covers AC3 / AC4 / AC5.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  listAgents: vi.fn(),
  setSessionAgent: vi.fn(),
}));

import * as chatApi from "../lib/chatApi";
import type { AgentMeta } from "../lib/chatApi";
import { AgentCatalogSidebar } from "./AgentCatalogSidebar";
import { useAgentCatalog } from "../lib/agentCatalog";
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
const NEW = agent("a3", "Agent (copy)");

const seedSession = (messageCount: number, active: AgentMeta = ALICE) => {
  useChat.setState((prev) => ({
    ...prev,
    activeSessionId: "s1",
    sessions: [
      {
        id: "s1",
        title: "Test thread",
        created_at: 0,
        updated_at: 0,
        message_count: messageCount,
        agent: active,
      },
    ],
    messages: [],
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  useAgentCatalog.setState({ agents: null, focusedId: null });
  vi.mocked(chatApi.listAgents).mockResolvedValue([ALICE, BOB]);
  vi.mocked(chatApi.createAgent).mockResolvedValue(NEW);
  vi.mocked(chatApi.deleteAgent).mockResolvedValue({
    deleted: true,
    id: BOB.id,
    sessions_repointed: 0,
    default_agent_id: ALICE.id,
  });
  vi.mocked(chatApi.setSessionAgent).mockImplementation(async (sid, aid) => ({
    id: sid,
    title: "Test thread",
    created_at: 0,
    updated_at: 0,
    message_count: 0,
    agent: aid === ALICE.id ? ALICE : aid === BOB.id ? BOB : NEW,
  }));
});

afterEach(() => {
  cleanup();
});

describe("AgentCatalogSidebar — create/delete move focus (064)", () => {
  it("locked: + creates an agent and focuses it, without re-binding (AC3)", async () => {
    seedSession(1, ALICE);
    render(<AgentCatalogSidebar />);
    await screen.findByTestId(`agent-catalog-row-${ALICE.id}`);

    fireEvent.click(screen.getByTestId("agent-catalog-new"));

    await vi.waitFor(() => {
      expect(chatApi.createAgent).toHaveBeenCalled();
      expect(useAgentCatalog.getState().focusedId).toBe(NEW.id);
    });
    // The new agent shows in the list (upserted locally, no reload needed)…
    expect(await screen.findByTestId(`agent-catalog-row-${NEW.id}`)).toBeTruthy();
    // …and the locked conversation's running agent is untouched.
    expect(chatApi.setSessionAgent).not.toHaveBeenCalled();
  });

  it("unlocked: + creates, focuses, AND re-binds the session (AC4)", async () => {
    seedSession(0, ALICE);
    render(<AgentCatalogSidebar />);
    await screen.findByTestId(`agent-catalog-row-${ALICE.id}`);

    fireEvent.click(screen.getByTestId("agent-catalog-new"));

    await vi.waitFor(() => {
      expect(chatApi.createAgent).toHaveBeenCalled();
      expect(chatApi.setSessionAgent).toHaveBeenCalledWith("s1", NEW.id);
    });
    expect(useAgentCatalog.getState().focusedId).toBe(NEW.id);
  });

  it("deletes the focused non-default agent while locked; focus returns to default (AC5)", async () => {
    seedSession(1, ALICE);
    render(<AgentCatalogSidebar />);
    // Focus Bob (non-default) — selecting while locked just focuses.
    fireEvent.click(await screen.findByTestId(`agent-catalog-row-${BOB.id}`));
    await vi.waitFor(() => {
      expect(useAgentCatalog.getState().focusedId).toBe(BOB.id);
    });

    // The delete affordance is available for the focused non-default agent.
    fireEvent.click(screen.getByTestId("agent-catalog-delete"));
    fireEvent.click(screen.getByTestId("agent-catalog-delete-confirm"));

    await vi.waitFor(() => {
      expect(chatApi.deleteAgent).toHaveBeenCalledWith(BOB.id);
      // Focus is cleared back to the session/default after delete.
      expect(useAgentCatalog.getState().focusedId).toBeNull();
    });
    // Locked: the conversation is not re-pointed client-side.
    expect(chatApi.setSessionAgent).not.toHaveBeenCalled();
  });
});
