// 045-composer-agent-selector — the 044 dialog catalog sidebar follows the
// same lock the composer chip does: an agent row can't be re-selected while
// the active conversation has any persisted message. The catalog management
// affordances (+ Novo / 🗑) stay enabled — they operate on the catalog, not
// on the session-agent link. Covers AC10 + AC11.

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

describe("AgentCatalogSidebar — lock follows message_count (045)", () => {
  it("disables rows + sets the lock tooltip when message_count > 0 (AC10)", async () => {
    seedSession(1, ALICE);
    render(<AgentCatalogSidebar />);
    // Wait for the catalog to load + render.
    const bobRow = await screen.findByTestId(`agent-catalog-row-${BOB.id}`);
    expect(bobRow.hasAttribute("disabled")).toBe(true);
    expect(bobRow.getAttribute("title") ?? "").toMatch(/locked after the conversation/i);
    // Clicking is a no-op.
    fireEvent.click(bobRow);
    expect(chatApi.setSessionAgent).not.toHaveBeenCalled();

    // The catalog management buttons stay enabled — they operate on the
    // catalog, not on the session-agent link.
    const novo = screen.getByTestId("agent-catalog-new");
    expect(novo.hasAttribute("disabled")).toBe(false);
  });

  it("leaves rows clickable when message_count === 0 (AC11)", async () => {
    seedSession(0, ALICE);
    render(<AgentCatalogSidebar />);
    const bobRow = await screen.findByTestId(`agent-catalog-row-${BOB.id}`);
    expect(bobRow.hasAttribute("disabled")).toBe(false);
    // Title is the agent name (not the lock string).
    expect(bobRow.getAttribute("title") ?? "").toBe(BOB.name);
    fireEvent.click(bobRow);
    // Hook into the side-effect path: setSessionAgent should fire.
    await vi.waitFor(() => {
      expect(chatApi.setSessionAgent).toHaveBeenCalled();
    });
  });
});
