// tool-semantics fix — the Tools section must let the user reach a real
// "no tools" agent. The bug: an empty list was overloaded to mean "all tools",
// so unchecking the last tool silently re-enabled everything. Honest semantics:
// null (unset) = all · [] = none · [...] = exactly those.

/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchAgent = vi.fn();

vi.mock("../lib/chatApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chatApi")>();
  return {
    ...actual,
    getConfig: () =>
      Promise.resolve({
        tools: [
          { name: "calculator", description: "math" },
          { name: "current_time", description: "clock" },
        ],
      }),
    patchAgent: (...args: unknown[]) =>
      patchAgent(...args).then(() => ({
        id: "a1",
        name: "Agent Simulator",
        description: "",
        system_prompt: "G",
        agent_prompt: "R",
        model: "gpt-4o-mini",
        provider: "openai",
        enabled_tools: (args[1] as { enabled_tools?: unknown })?.enabled_tools ?? null,
        is_default: false,
        created_at: 0,
        updated_at: 0,
      })),
  };
});

import { ToolsSection } from "./ToolsSection";
import { useChat } from "../store/useChat";

function mountWithTools(enabled_tools: string[] | null) {
  useChat.setState({
    sessions: [
      {
        id: "s1",
        title: null,
        agent: {
          id: "a1",
          name: "Agent Simulator",
          description: "",
          system_prompt: "G",
          agent_prompt: "R",
          model: "gpt-4o-mini",
          provider: "openai",
          enabled_tools,
          is_default: false,
          created_at: 0,
          updated_at: 0,
        },
        created_at: 0,
        updated_at: 0,
      },
    ],
    activeSessionId: "s1",
  });
}

beforeEach(() => {
  patchAgent.mockReset();
  patchAgent.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  useChat.setState({ sessions: [], activeSessionId: null });
  vi.restoreAllMocks();
});

describe("ToolsSection — null/[] semantics", () => {
  it("unchecking the LAST enabled tool persists [] (a real no-tools agent), not null", async () => {
    mountWithTools(["calculator"]); // only calculator on
    const { unmount } = render(<ToolsSection />);
    const cb = (await screen.findByTestId("agent-anatomy-tool-calculator")) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb); // turn the last one off
    act(() => unmount()); // flush the debounced PATCH
    expect(patchAgent).toHaveBeenCalledWith("a1", { enabled_tools: [] });
  });

  it("with all tools on (null), unchecking one persists the explicit remaining subset", async () => {
    mountWithTools(null); // all tools
    const { unmount } = render(<ToolsSection />);
    const cb = (await screen.findByTestId("agent-anatomy-tool-calculator")) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    act(() => unmount());
    expect(patchAgent).toHaveBeenCalledWith("a1", { enabled_tools: ["current_time"] });
  });

  it("re-checking the final missing tool collapses back to null (all/unset)", async () => {
    mountWithTools(["calculator"]); // current_time missing
    const { unmount } = render(<ToolsSection />);
    const cb = (await screen.findByTestId("agent-anatomy-tool-current_time")) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb); // now both on → all
    act(() => unmount());
    expect(patchAgent).toHaveBeenCalledWith("a1", { enabled_tools: null });
  });
});
