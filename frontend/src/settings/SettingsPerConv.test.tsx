// 041-settings-page · AC7 — the page is per-conversation, just like the
// popover was. Switching the active conversation must surface that
// conversation's own experiment overrides; one conversation's typing
// must not leak into the other.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  getConfig: vi.fn().mockResolvedValue({
    default_system_prompt: "Default prompt.",
    default_top_k: 3,
    top_k_min: 1,
    top_k_max: 8,
    tools: [],
    scenarios: [],
    failure_modes: ["none"],
  }),
}));

import { SettingsExperiment } from "./SettingsExperiment";
import { useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

beforeEach(() => {
  useExperiment.setState({ byConv: {} });
  useChat.setState({ activeSessionId: "c1" });
});

afterEach(() => {
  cleanup();
});

describe("SettingsExperiment — per-conversation scope (AC7)", () => {
  it("switching activeSessionId surfaces the new conversation's overrides", async () => {
    const { rerender } = render(<SettingsExperiment />);
    const ta = (await screen.findByRole("textbox", {
      name: /System prompt/i,
    })) as HTMLTextAreaElement;

    // Type in c1.
    fireEvent.change(ta, { target: { value: "c1 prompt" } });
    expect(useExperiment.getState().byConv.c1?.systemPrompt).toBe("c1 prompt");

    // Switch to c2 (no override stored). The textarea should reflect c2's
    // default — NOT c1's text.
    useChat.setState({ activeSessionId: "c2" });
    rerender(<SettingsExperiment />);

    const ta2 = (await screen.findByRole("textbox", {
      name: /System prompt/i,
    })) as HTMLTextAreaElement;
    expect(ta2.value).toBe("Default prompt.");
    expect(useExperiment.getState().byConv.c2).toBeUndefined();
  });
});
