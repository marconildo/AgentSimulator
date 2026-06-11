// 041-settings-page · per-conversation scope check after 043 slimmed the
// page. The remaining per-run knob (top-k) still scopes per conversation —
// switching `activeSessionId` surfaces the new conv's value, not the prior's.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  getConfig: vi.fn().mockResolvedValue({
    default_system_prompt: "Default prompt.",
    default_agent_prompt: "Role.",
    default_top_k: 3,
    top_k_min: 1,
    top_k_max: 8,
    default_rerank_threshold: 0,
    rerank_threshold_step: 0.05,
    tools: [],
    scenarios: [],
    failure_modes: ["none"],
    models: [{ id: "gpt-4o-mini", label: "GPT-4o mini", description: "" }],
    default_model: "gpt-4o-mini",
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
  it("switching activeSessionId surfaces the new conversation's top-k", async () => {
    const { rerender } = render(<SettingsExperiment />);
    const range = (await screen.findByRole("slider", { name: /top-k/i })) as HTMLInputElement;

    // Drag in c1.
    fireEvent.change(range, { target: { value: "7" } });
    expect(useExperiment.getState().byConv.c1?.topK).toBe(7);

    // Switch to c2 (no override). The slider should reflect the default — NOT c1's 7.
    useChat.setState({ activeSessionId: "c2" });
    rerender(<SettingsExperiment />);

    const range2 = (await screen.findByRole("slider", { name: /top-k/i })) as HTMLInputElement;
    expect(range2.value).toBe("3"); // server default top-k
    expect(useExperiment.getState().byConv.c2).toBeUndefined();
  });
});
