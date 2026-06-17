// 042-agent-anatomy — AC11/12/16/19 — the dialog mounts, closes, edits stick.
//
// Focused RTL coverage on the dialog wrapper. Per-section logic is exercised
// through the store contracts the sections write to (`useExperiment`, the
// chatApi mocks), so we avoid testing internal CSS / scroll behavior.

/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    tools: [
      { name: "calculator", description: "math" },
      { name: "current_time", description: "time" },
    ],
    scenarios: [],
    failure_modes: ["none"],
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", description: "small" },
      { id: "gpt-4.1", label: "GPT-4.1", description: "large" },
    ],
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
    // 044-shared-agent-catalog: the dialog uses these for the sidebar and the
    // useActiveAgent fallback when there's no session-bound agent.
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
import { useExperiment } from "../lib/experiment";

beforeEach(() => {
  useAgentAnatomy.setState({ open: false, initialSection: null });
  useAgentCatalog.setState({ agents: null, focusedId: null });
  useExperiment.setState({ byConv: {} });
  // jsdom doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  useAgentAnatomy.setState({ open: false, initialSection: null });
  vi.restoreAllMocks();
});

describe("AgentAnatomyDialog", () => {
  it("does not render when closed (AC11)", () => {
    render(<AgentAnatomyDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders all eight sections when opened (AC11)", async () => {
    useAgentAnatomy.setState({ open: true });
    render(<AgentAnatomyDialog />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    // Headings (en) for each section land on the dialog. The left-rail nav
    // also lists every title, so each label appears at least once — using
    // getAllByText keeps the assertion intent (presence of the section).
    for (const label of [
      "Identity",
      "System prompt",
      "Agent prompt",
      "Provider",
      "Model",
      "Tools",
      "Knowledge base",
      "Skills",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("closes on the ✕ button (AC12)", async () => {
    useAgentAnatomy.setState({ open: true });
    render(<AgentAnatomyDialog />);
    fireEvent.click(await screen.findByTestId("agent-anatomy-close"));
    expect(useAgentAnatomy.getState().open).toBe(false);
  });

  it("clears the catalog edit-focus when it closes (064 AC7)", async () => {
    useAgentCatalog.setState({ focusedId: "some-focused-agent" });
    useAgentAnatomy.setState({ open: true });
    const { rerender } = render(<AgentAnatomyDialog />);
    await screen.findByRole("dialog");
    // Close → the dialog unmounts its body and the focus is reset.
    useAgentAnatomy.setState({ open: false });
    rerender(<AgentAnatomyDialog />);
    expect(useAgentCatalog.getState().focusedId).toBeNull();
  });

  it("closes on Esc (AC12)", async () => {
    useAgentAnatomy.setState({ open: true });
    render(<AgentAnatomyDialog />);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useAgentAnatomy.getState().open).toBe(false);
  });

  it("renders tool checkboxes from /api/config (AC16)", async () => {
    // 043-persisted-agent: tool toggles now PATCH the active agent (covered by
    // section-level tests). Here we just assert the dialog mounts the tool
    // rows from the cached `/api/config.tools` payload.
    useAgentAnatomy.setState({ open: true });
    render(<AgentAnatomyDialog />);
    expect(await screen.findByTestId("agent-anatomy-tool-calculator")).toBeTruthy();
    expect(await screen.findByTestId("agent-anatomy-tool-current_time")).toBeTruthy();
  });

  it("shared-skills callout is visible in the Skills section (AC19)", async () => {
    useAgentAnatomy.setState({ open: true });
    render(<AgentAnatomyDialog />);
    // The exact bilingual callout text from i18n/strings.ts (en).
    expect(
      await screen.findByText(/Skills are shared across all conversations/i),
    ).toBeTruthy();
  });
});
