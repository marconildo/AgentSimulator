// 074-ollama-provider — AC8 — the Provider section is interactive: OpenAI and
// Ollama are both selectable. Selecting Ollama persists `provider:"ollama"` on
// the agent, reveals the local Server-URL field, and lists the models installed
// on that server. An unreachable server shows a bilingual hint. Selecting OpenAI
// keeps the curated model dropdown (ModelSection).

/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchAgent = vi.fn();
const getOllamaModels = vi.fn();
const getOllamaSettings = vi.fn();
const setOllamaSettings = vi.fn();

const baseAgent = {
  id: "a1",
  name: "Agent Simulator",
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
      { id: "ollama", label: "Ollama (local)", available: true },
    ],
    default_provider: "openai",
    default_ollama_base_url: "http://localhost:11434",
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
    listAgents: () => Promise.resolve([baseAgent]),
    patchAgent: (id: string, body: Record<string, unknown>) =>
      patchAgent(id, body).then(() => ({ ...baseAgent, ...body })),
    createAgent: () => Promise.resolve(baseAgent),
    deleteAgent: () =>
      Promise.resolve({ deleted: true, id: "x", sessions_repointed: 0, default_agent_id: "a1" }),
    setSessionAgent: () => Promise.resolve(null),
    getOllamaSettings: (...a: unknown[]) => getOllamaSettings(...a),
    getOllamaModels: (...a: unknown[]) => getOllamaModels(...a),
    setOllamaSettings: (...a: unknown[]) => setOllamaSettings(...a),
    // 078-openai-key-ui: ProviderSection's OpenAI branch reads these now.
    getOpenAISettings: () => Promise.resolve({ has_key: false, masked: null, source: null }),
    setOpenAISettings: () => Promise.resolve({ ok: true, has_key: true, masked: "sk-…1234", tested: true }),
    getOpenAIModels: () => Promise.resolve({ reachable: false, models: [] }),
    ApiError: class extends Error {},
  };
});

import { ProviderSection } from "../agent-anatomy/ProviderSection";
import { useChat } from "../store/useChat";

function seedSession(provider = "openai") {
  useChat.setState({
    sessions: [
      {
        id: "s1",
        title: null,
        agent: { ...baseAgent, provider },
        created_at: 0,
        updated_at: 0,
      },
    ],
    activeSessionId: "s1",
  });
}

beforeEach(() => {
  patchAgent.mockReset().mockResolvedValue(undefined);
  setOllamaSettings.mockReset().mockResolvedValue({ base_url: "http://localhost:11434" });
  getOllamaSettings.mockReset().mockResolvedValue({ base_url: "http://localhost:11434" });
  getOllamaModels.mockReset().mockResolvedValue({
    reachable: true,
    base_url: "http://localhost:11434",
    models: [{ id: "llama3.1" }, { id: "qwen2.5" }],
  });
});

afterEach(() => {
  cleanup();
  useChat.setState({ sessions: [], activeSessionId: null });
  vi.restoreAllMocks();
});

describe("ProviderSection — Ollama (074)", () => {
  it("renders both providers, both selectable", async () => {
    seedSession("openai");
    render(<ProviderSection />);
    const openai = (await screen.findByTestId("agent-anatomy-provider-openai")) as HTMLInputElement;
    const ollama = (await screen.findByTestId("agent-anatomy-provider-ollama")) as HTMLInputElement;
    expect(openai.checked).toBe(true);
    expect(openai.disabled).toBe(false);
    expect(ollama.disabled).toBe(false);
  });

  it("selecting Ollama persists provider:'ollama' on the agent", async () => {
    seedSession("openai");
    render(<ProviderSection />);
    const ollama = await screen.findByTestId("agent-anatomy-provider-ollama");
    act(() => {
      fireEvent.click(ollama);
    });
    expect(patchAgent).toHaveBeenCalledWith("a1", { provider: "ollama" });
  });

  it("shows the server-URL field + live model list when on Ollama", async () => {
    seedSession("ollama");
    render(<ProviderSection />);
    expect(await screen.findByTestId("agent-anatomy-ollama-url")).toBeTruthy();
    const select = (await screen.findByTestId("agent-anatomy-ollama-model")) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(2));
    expect(getOllamaModels).toHaveBeenCalled();
  });

  it("shows the unreachable hint when the server can't be reached", async () => {
    getOllamaModels.mockResolvedValue({
      reachable: false,
      base_url: "http://nope:11434",
      models: [],
      error: "refused",
    });
    seedSession("ollama");
    render(<ProviderSection />);
    const hint = await screen.findByTestId("agent-anatomy-ollama-hint");
    expect(hint.textContent).toMatch(/Ollama/i);
  });
});
