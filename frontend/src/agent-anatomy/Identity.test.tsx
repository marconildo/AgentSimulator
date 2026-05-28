// 042 regression + 043 wiring: Identity edits PATCH the agent row via
// `useActiveAgent` (debounced 500 ms, flushed on blur + on dialog unmount).
//
// The 042 bug ("name lost when closing the dialog before debounce") is
// covered by the unmount-flush test. 043's wiring shift (the section now
// calls `patchAgent` instead of the removed `patchSession`) is covered by
// the URL assertion in each test.

/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchAgent = vi.fn();

vi.mock("../lib/chatApi", () => ({
  patchAgent: (...args: unknown[]) =>
    patchAgent(...args).then(() => ({
      id: "a1",
      name:
        typeof args[1] === "object" && args[1]
          ? (args[1] as { name?: string }).name ?? "Agent Simulator"
          : "Agent Simulator",
      description: "",
      system_prompt: "G",
      agent_prompt: "R",
      model: "gpt-4o-mini",
      enabled_tools: [],
      is_default: false,
      created_at: 0,
      updated_at: 0,
    })),
}));

import { Identity } from "./Identity";
import { useChat } from "../store/useChat";

const _AGENT = {
  id: "a1",
  name: "Agent Simulator",
  description: "",
  system_prompt: "G",
  agent_prompt: "R",
  model: "gpt-4o-mini",
  enabled_tools: [] as string[],
  is_default: false,
  created_at: 0,
  updated_at: 0,
};
const _SESSION = {
  id: "s1",
  title: null,
  agent: _AGENT,
  created_at: 0,
  updated_at: 0,
};

beforeEach(() => {
  patchAgent.mockReset();
  patchAgent.mockResolvedValue(undefined);
  useChat.setState({
    sessions: [{ ..._SESSION }],
    activeSessionId: "s1",
  });
});

afterEach(() => {
  cleanup();
  useChat.setState({ sessions: [], activeSessionId: null });
  vi.restoreAllMocks();
});

describe("Identity — name persistence (042 regression + 043 wiring)", () => {
  it("blurring the name input flushes the PATCH immediately (no debounce wait)", () => {
    render(<Identity />);
    const input = screen.getByTestId("agent-anatomy-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hotel Analyst" } });
    expect(patchAgent).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(patchAgent).toHaveBeenCalledWith("a1", { name: "Hotel Analyst" });
  });

  it("unmounting while the debounce is pending still PATCHes the typed name", () => {
    const { unmount } = render(<Identity />);
    const input = screen.getByTestId("agent-anatomy-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Lisbon Guide" } });
    act(() => {
      unmount();
    });
    // The pending merge buffer was flushed: patchAgent was called with the
    // most-recent draft value, keyed on the active agent's id.
    expect(patchAgent).toHaveBeenCalled();
    const call = patchAgent.mock.calls[0];
    expect(call[0]).toBe("a1");
    expect(call[1]).toMatchObject({ name: "Lisbon Guide" });
  });

  it("description edits also PATCH the agent row (043 — description now persists)", () => {
    render(<Identity />);
    const desc = screen.getByTestId("agent-anatomy-desc-input") as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: "Specialist in hotel KPIs." } });
    fireEvent.blur(desc);
    expect(patchAgent).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ description: "Specialist in hotel KPIs." }),
    );
  });
});
