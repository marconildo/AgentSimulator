// 065-provider-and-model-refresh — AC5 — the Agent Anatomy dialog renders a
// Provider section: OpenAI is the selected/active provider; Ollama is a disabled
// preview ("coming soon"). It reads the provider list from /api/config so it
// never hardcodes the provider names.

/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => {
  const config = {
    default_system_prompt: "GUARDRAILS",
    default_agent_prompt: "ROLE",
    default_top_k: 4,
    top_k_min: 1,
    top_k_max: 8,
    default_rerank_threshold: 0,
    rerank_threshold_step: 0.05,
    tools: [],
    scenarios: [],
    failure_modes: ["none"],
    models: [{ id: "gpt-4.1-mini", label: "GPT-4.1 mini", description: "default" }],
    default_model: "gpt-4.1-mini",
    providers: [
      { id: "openai", label: "OpenAI", available: true },
      { id: "ollama", label: "Ollama (local)", available: false },
    ],
    default_provider: "openai",
  };
  const defaultAgent = {
    id: "default-agent",
    name: "Agent Simulator",
    description: "default",
    system_prompt: "GUARDRAILS",
    agent_prompt: "ROLE",
    model: "gpt-4.1-mini",
    enabled_tools: [],
    is_default: true,
    created_at: 0,
    updated_at: 0,
  };
  return {
    getConfig: () => Promise.resolve(config),
    getCorpus: () => Promise.resolve({ files: [] }),
    listDocuments: () => Promise.resolve([]),
    listSkills: () => Promise.resolve([]),
    createSkill: () => Promise.resolve({}),
    updateSkill: () => Promise.resolve({}),
    deleteSkill: () => Promise.resolve({ deleted: true }),
    uploadDocument: () => Promise.resolve(),
    deleteDocument: () => Promise.resolve({}),
    patchSession: () => Promise.resolve({}),
    listAgents: () => Promise.resolve([defaultAgent]),
    patchAgent: () => Promise.resolve(defaultAgent),
    createAgent: () => Promise.resolve(defaultAgent),
    deleteAgent: () =>
      Promise.resolve({ deleted: true, id: "x", sessions_repointed: 0, default_agent_id: defaultAgent.id }),
    setSessionAgent: () => Promise.resolve(null),
    ApiError: class extends Error {
      constructor(public status: number, message: string) {
        super(message);
      }
    },
  };
});

import { AgentAnatomyDialog } from "./AgentAnatomyDialog";
import { useAgentAnatomy } from "../lib/agentAnatomy";
import { useAgentCatalog } from "../lib/agentCatalog";

beforeEach(() => {
  useAgentAnatomy.setState({ open: true, initialSection: null });
  useAgentCatalog.setState({ agents: null, focusedId: null });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  useAgentAnatomy.setState({ open: false, initialSection: null });
  vi.restoreAllMocks();
});

describe("AgentAnatomyDialog — Provider section (065)", () => {
  it("renders the Provider section heading (AC5)", async () => {
    render(<AgentAnatomyDialog />);
    await screen.findByRole("dialog");
    expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
  });

  it("OpenAI is the selected provider and Ollama is a disabled preview (AC5)", async () => {
    render(<AgentAnatomyDialog />);
    await screen.findByRole("dialog");

    const openai = (await screen.findByTestId(
      "agent-anatomy-provider-openai",
    )) as HTMLInputElement;
    const ollama = (await screen.findByTestId(
      "agent-anatomy-provider-ollama",
    )) as HTMLInputElement;

    expect(openai.checked).toBe(true);
    expect(openai.disabled).toBe(false);
    expect(ollama.disabled).toBe(true);
    expect(ollama.checked).toBe(false);
  });
});
