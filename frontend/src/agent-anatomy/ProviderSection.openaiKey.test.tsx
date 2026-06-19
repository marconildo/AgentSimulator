// 076-openai-key-ui — AC6 — the Provider section (OpenAI selected) shows an API
// key field + Save; saving calls setOpenAISettings and reflects connected/failed;
// a saved key shows the masked hint (never the full key).

/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setOpenAISettings = vi.fn();
const getOpenAISettings = vi.fn();

const baseAgent = {
  id: "a1",
  name: "A",
  description: "",
  system_prompt: "G",
  agent_prompt: "R",
  model: "gpt-4.1-mini",
  provider: "openai",
  enabled_tools: [] as string[],
  is_default: true,
  created_at: 0,
  updated_at: 0,
};

vi.mock("../lib/chatApi", () => ({
  getConfig: () =>
    Promise.resolve({
      providers: [
        { id: "openai", label: "OpenAI", available: true },
        { id: "ollama", label: "Ollama (local)", available: true },
      ],
      default_provider: "openai",
      models: [],
    }),
  patchAgent: (_id: string, body: Record<string, unknown>) =>
    Promise.resolve({ ...baseAgent, ...body }),
  getOpenAISettings: (...a: unknown[]) => getOpenAISettings(...a),
  setOpenAISettings: (...a: unknown[]) => setOpenAISettings(...a),
  getOllamaSettings: () => Promise.resolve({ base_url: "http://localhost:11434" }),
  getOllamaModels: () => Promise.resolve({ reachable: true, base_url: "", models: [] }),
  setOllamaSettings: () => Promise.resolve({ base_url: "" }),
}));

import { ProviderSection } from "./ProviderSection";
import { useChat } from "../store/useChat";

beforeEach(() => {
  getOpenAISettings.mockReset().mockResolvedValue({ has_key: false, masked: null, source: null });
  setOpenAISettings
    .mockReset()
    .mockResolvedValue({ ok: true, has_key: true, masked: "sk-…1234", tested: true, model_count: 7 });
  useChat.setState({
    sessions: [{ id: "s1", title: null, agent: { ...baseAgent }, created_at: 0, updated_at: 0 }],
    activeSessionId: "s1",
  });
});

afterEach(() => {
  cleanup();
  useChat.setState({ sessions: [], activeSessionId: null });
  vi.restoreAllMocks();
});

describe("ProviderSection — OpenAI key (076)", () => {
  it("shows the API key field when OpenAI is selected", async () => {
    render(<ProviderSection />);
    expect(await screen.findByTestId("agent-anatomy-openai-key")).toBeTruthy();
  });

  it("saving a key calls setOpenAISettings and shows connected", async () => {
    render(<ProviderSection />);
    const input = (await screen.findByTestId("agent-anatomy-openai-key")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-secret-value-1234" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("agent-anatomy-openai-save"));
    });
    expect(setOpenAISettings).toHaveBeenCalledWith("sk-secret-value-1234");
    await waitFor(() =>
      expect(screen.getByTestId("agent-anatomy-openai-status").textContent).toBeTruthy(),
    );
  });

  it("shows the masked hint (never the full key) for a saved key", async () => {
    getOpenAISettings.mockResolvedValue({ has_key: true, masked: "sk-…1234", source: "db" });
    render(<ProviderSection />);
    await waitFor(() => expect(screen.getByText(/sk-…1234/)).toBeTruthy());
  });
});
