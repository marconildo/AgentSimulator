// 041-settings-page · AC6b/c/d regression for the 🧪 Experiment block after
// it leaves the popover. Asserts the system prompt textarea, the tool toggles,
// and the top-k slider all keep wiring `useExperiment.byConv[conv]` exactly as
// the popover did, and that the Reset button clears overrides when dirty.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  getConfig: vi.fn().mockResolvedValue({
    default_system_prompt: "You are the assistant.",
    default_top_k: 3,
    top_k_min: 1,
    top_k_max: 8,
    tools: [
      { name: "calculator", description: "Math" },
      { name: "current_time", description: "Now" },
      { name: "search_knowledge_base", description: "RAG" },
    ],
    scenarios: [],
    failure_modes: ["none", "tool_error"],
  }),
}));

import { SettingsExperiment } from "./SettingsExperiment";
import { DRAFT_KEY, useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

beforeEach(() => {
  useExperiment.setState({ byConv: {} });
  useChat.setState({ activeSessionId: null });
});

afterEach(() => {
  cleanup();
});

// Some browsers/jsdom serialize <input type="range"> changes only on a
// dispatched change event with a value; React Testing Library's fireEvent
// handles this, but we double-check by mutating value before dispatch.
const setRange = (el: HTMLInputElement, value: number) => {
  fireEvent.change(el, { target: { value: String(value) } });
};

describe("SettingsExperiment — AC6b/c/d", () => {
  it("typing the system prompt textarea writes byConv[draft].systemPrompt", async () => {
    render(<SettingsExperiment />);
    const ta = (await screen.findByRole("textbox", {
      name: /System prompt/i,
    })) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Be terse." } });
    expect(useExperiment.getState().byConv[DRAFT_KEY]?.systemPrompt).toBe("Be terse.");
  });

  it("the Reset button appears only when dirty and clears the override on click", async () => {
    render(<SettingsExperiment />);
    expect(screen.queryByRole("button", { name: /Reset to default/i })).toBeNull();
    const ta = await screen.findByRole("textbox", { name: /System prompt/i });
    fireEvent.change(ta, { target: { value: "Be terse." } });
    const reset = await screen.findByRole("button", { name: /Reset to default/i });
    fireEvent.click(reset);
    await waitFor(() =>
      expect(useExperiment.getState().byConv[DRAFT_KEY]).toBeUndefined(),
    );
  });

  it("unchecking a tool removes it from enabledTools; rechecking restores it", async () => {
    render(<SettingsExperiment />);
    const calcCheckbox = (await screen.findByLabelText(/Calculator/i, {
      selector: "input",
    })) as HTMLInputElement;
    expect(calcCheckbox.checked).toBe(true);

    fireEvent.click(calcCheckbox);
    expect(useExperiment.getState().byConv[DRAFT_KEY]?.enabledTools).toEqual(
      expect.not.arrayContaining(["calculator"]),
    );

    fireEvent.click(calcCheckbox);
    // Back to all-on ⇒ store normalizes to null (no override).
    expect(useExperiment.getState().byConv[DRAFT_KEY]?.enabledTools).toBeNull();
  });

  it("the top-k slider updates byConv[conv].topK", async () => {
    render(<SettingsExperiment />);
    const range = (await screen.findByRole("slider")) as HTMLInputElement;
    setRange(range, 6);
    expect(useExperiment.getState().byConv[DRAFT_KEY]?.topK).toBe(6);
  });
});
