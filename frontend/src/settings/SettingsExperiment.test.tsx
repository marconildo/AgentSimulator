// 041-settings-page · 🧪 Experiment regressions.
// 043-persisted-agent shrank this section: system prompt + tools + agent-fields
// moved to the Agent Anatomy dialog (they edit the persisted agent row now).
// What remains here is the per-run knobs: RAG top-k and the simulate-failure
// selector. Plus the redirect block pointing users to the dialog.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  getConfig: vi.fn().mockResolvedValue({
    default_system_prompt: "You are the assistant.",
    default_agent_prompt: "Role.",
    default_top_k: 3,
    top_k_min: 1,
    top_k_max: 8,
    default_rerank_threshold: 0,
    rerank_threshold_step: 0.05,
    tools: [
      { name: "calculator", description: "Math" },
      { name: "current_time", description: "Now" },
      { name: "search_knowledge_base", description: "RAG" },
    ],
    scenarios: [],
    failure_modes: ["none", "tool_error"],
    models: [{ id: "gpt-4o-mini", label: "GPT-4o mini", description: "" }],
    default_model: "gpt-4o-mini",
  }),
}));

import { SettingsExperiment } from "./SettingsExperiment";
import { useAgentAnatomy } from "../lib/agentAnatomy";
import { DRAFT_KEY, useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

beforeEach(() => {
  useExperiment.setState({ byConv: {} });
  useChat.setState({ activeSessionId: null });
  useAgentAnatomy.setState({ open: false, initialSection: null });
});

afterEach(() => {
  cleanup();
});

const setRange = (el: HTMLInputElement, value: number) => {
  fireEvent.change(el, { target: { value: String(value) } });
};

describe("SettingsExperiment — 043 shape", () => {
  it("no longer renders the system-prompt textarea (043 — moved to the dialog)", async () => {
    render(<SettingsExperiment />);
    // Wait for the redirect block (which depends on i18n) to settle the render.
    await screen.findByTestId("settings-open-agent-anatomy");
    expect(screen.queryByRole("textbox", { name: /System prompt/i })).toBeNull();
  });

  it("no longer renders the tool checkboxes (043 — moved to the dialog)", async () => {
    render(<SettingsExperiment />);
    await screen.findByTestId("settings-open-agent-anatomy");
    expect(screen.queryByLabelText(/Calculator/i, { selector: "input" })).toBeNull();
  });

  it("the redirect button opens the Agent Anatomy dialog (AC18)", async () => {
    render(<SettingsExperiment />);
    const btn = await screen.findByTestId("settings-open-agent-anatomy");
    fireEvent.click(btn);
    expect(useAgentAnatomy.getState().open).toBe(true);
  });

  it("the top-k slider still updates byConv[conv].topK (AC6d regression)", async () => {
    render(<SettingsExperiment />);
    const range = (await screen.findByRole("slider", { name: /top-k/i })) as HTMLInputElement;
    setRange(range, 6);
    expect(useExperiment.getState().byConv[DRAFT_KEY]?.topK).toBe(6);
  });
});
