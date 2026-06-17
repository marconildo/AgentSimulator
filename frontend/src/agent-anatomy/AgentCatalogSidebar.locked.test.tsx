// 045-composer-agent-selector → 064-agent-catalog-focus.
//
// 045 originally disabled every catalog row once the conversation had a
// persisted message. 064 corrects that: the catalog is *shared*, so editing,
// creating and deleting agents must stay possible regardless of the lock —
// only **re-binding the conversation's running agent** stays locked. So a
// locked row is now selectable for *editing* (it moves the dialog focus) but
// does NOT call `setSessionAgent`. The +New / 🗑 affordances stay enabled.

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
  vi.mocked(chatApi.setSessionAgent).mockImplementation(async (sid, aid) => ({
    id: sid,
    title: "Test thread",
    created_at: 0,
    updated_at: 0,
    message_count: 0,
    agent: aid === ALICE.id ? ALICE : BOB,
  }));
});

afterEach(() => {
  cleanup();
});

describe("AgentCatalogSidebar — lock gates only the session re-bind (064)", () => {
  it("locked: clicking a row focuses it for editing but does NOT re-bind (AC1)", async () => {
    seedSession(1, ALICE);
    render(<AgentCatalogSidebar />);
    const bobRow = await screen.findByTestId(`agent-catalog-row-${BOB.id}`);
    // Rows are no longer disabled by the lock — you can edit any catalog agent.
    expect(bobRow.hasAttribute("disabled")).toBe(false);

    fireEvent.click(bobRow);
    // The dialog focus moves to Bob (the editor will now edit Bob)…
    await vi.waitFor(() => {
      expect(useAgentCatalog.getState().focusedId).toBe(BOB.id);
    });
    // …but the conversation's running agent is untouched.
    expect(chatApi.setSessionAgent).not.toHaveBeenCalled();

    // The catalog management buttons stay enabled.
    expect(screen.getByTestId("agent-catalog-new").hasAttribute("disabled")).toBe(false);
    // And we explain why selecting doesn't swap the conversation's agent.
    expect(screen.getByTestId("agent-catalog-locked-hint")).toBeTruthy();
  });

  it("unlocked: clicking a row focuses AND re-binds the session (AC2)", async () => {
    seedSession(0, ALICE);
    render(<AgentCatalogSidebar />);
    const bobRow = await screen.findByTestId(`agent-catalog-row-${BOB.id}`);
    expect(bobRow.hasAttribute("disabled")).toBe(false);
    expect(bobRow.getAttribute("title") ?? "").toBe(BOB.name);
    fireEvent.click(bobRow);
    await vi.waitFor(() => {
      expect(chatApi.setSessionAgent).toHaveBeenCalled();
    });
    expect(useAgentCatalog.getState().focusedId).toBe(BOB.id);
    // No lock hint when the conversation hasn't started.
    expect(screen.queryByTestId("agent-catalog-locked-hint")).toBeNull();
  });
});
