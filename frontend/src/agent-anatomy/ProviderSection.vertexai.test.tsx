/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchAgent = vi.fn();
const getVertexAISettings = vi.fn();
const setVertexAISettings = vi.fn();

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
      { id: "vertexai", label: "Vertex AI", available: true },
    ],
    default_provider: "openai",
    vertexai_models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "pro" },
    ],
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
    getOllamaSettings: () => Promise.resolve({ base_url: "http://localhost:11434" }),
    getOllamaModels: () => Promise.resolve({ reachable: false, base_url: "", models: [] }),
    setOllamaSettings: () => Promise.resolve({ base_url: "" }),
    getOpenAISettings: () => Promise.resolve({ has_key: false, masked: null, source: null }),
    getOpenAISettingsSync: () => ({ has_key: false, masked: null, source: null }),
    getVertexAISettings: (...a: unknown[]) => getVertexAISettings(...a),
    setVertexAISettings: (...a: unknown[]) => setVertexAISettings(...a),
    ApiError: class extends Error {},
  };
});

import { ProviderSection } from "./ProviderSection";
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
  getVertexAISettings.mockReset().mockResolvedValue({
    project: "my-project",
    location: "us-central1",
    has_credentials: true,
    masked_credentials: "Credentials are saved.",
  });
  setVertexAISettings.mockReset().mockResolvedValue({
    ok: true,
    error: null,
    project: "my-project",
    location: "us-central1",
    has_credentials: true,
    masked_credentials: "Credentials are saved.",
  });
});

afterEach(() => {
  cleanup();
  useChat.setState({ sessions: [], activeSessionId: null });
  vi.restoreAllMocks();
});

describe("ProviderSection — Vertex AI (089)", () => {
  it("renders Vertex AI as selectable and patches agent", async () => {
    seedSession("openai");
    render(<ProviderSection />);

    const vertexai = (await screen.findByTestId("agent-anatomy-provider-vertexai")) as HTMLInputElement;
    expect(vertexai.checked).toBe(false);

    act(() => {
      fireEvent.click(vertexai);
    });

    expect(patchAgent).toHaveBeenCalledWith("a1", {
      provider: "vertexai",
      model: "gemini-2.5-flash",
    });
  });

  it("shows Vertex AI settings inputs and persists options", async () => {
    seedSession("vertexai");
    render(<ProviderSection />);

    const projectInput = await screen.findByTestId("agent-anatomy-vertexai-project");
    const locationInput = await screen.findByTestId("agent-anatomy-vertexai-location");
    const credentialsInput = await screen.findByTestId("agent-anatomy-vertexai-credentials");
    const saveButton = await screen.findByTestId("agent-anatomy-vertexai-save");

    expect(projectInput).toBeTruthy();
    expect(locationInput).toBeTruthy();
    expect(credentialsInput).toBeTruthy();

    await waitFor(() => {
      expect((projectInput as HTMLInputElement).value).toBe("my-project");
    });

    act(() => {
      fireEvent.change(projectInput, { target: { value: "new-project" } });
      fireEvent.change(locationInput, { target: { value: "us-east1" } });
      fireEvent.change(credentialsInput, { target: { value: '{"type":"service_account"}' } });
    });

    act(() => {
      fireEvent.click(saveButton);
    });

    expect(setVertexAISettings).toHaveBeenCalledWith("new-project", "us-east1", '{"type":"service_account"}', "gpt-4.1-mini");

    const status = await screen.findByTestId("agent-anatomy-vertexai-status");
    expect(status.textContent).toMatch(/saved|salvas/i);
  });

  it("shows failed connection message on validation failure", async () => {
    setVertexAISettings.mockResolvedValue({
      ok: false,
      error: "Authentication failed",
      project: "my-project",
      location: "us-central1",
      has_credentials: false,
      masked_credentials: null,
    });
    seedSession("vertexai");
    render(<ProviderSection />);

    const saveButton = await screen.findByTestId("agent-anatomy-vertexai-save");
    act(() => {
      fireEvent.click(saveButton);
    });

    const status = await screen.findByTestId("agent-anatomy-vertexai-status");
    expect(status.textContent).toMatch(/fail|falha/i);
  });
});
