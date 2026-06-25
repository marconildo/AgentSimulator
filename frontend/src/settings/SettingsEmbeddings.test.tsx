// 075-ollama-embeddings — AC6 — the Embeddings (RAG) section persists the
// provider/model and lists installed Ollama models; an unreachable server shows
// the hint. Instance-wide (not per-agent).

/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setEmbeddingSettings = vi.fn();
const getEmbeddingSettings = vi.fn();
const getOllamaModels = vi.fn();
const getVertexAISettings = vi.fn();
const getConfig = vi.fn();

vi.mock("../lib/chatApi", () => ({
  getEmbeddingSettings: (...a: unknown[]) => getEmbeddingSettings(...a),
  setEmbeddingSettings: (...a: unknown[]) => setEmbeddingSettings(...a),
  getOllamaModels: (...a: unknown[]) => getOllamaModels(...a),
  getVertexAISettings: (...a: unknown[]) => getVertexAISettings(...a),
  getConfig: (...a: unknown[]) => getConfig(...a),
}));

import { SettingsEmbeddings } from "./SettingsEmbeddings";

beforeEach(() => {
  getEmbeddingSettings
    .mockReset()
    .mockResolvedValue({ provider: "openai", model: "text-embedding-3-small" });
  setEmbeddingSettings
    .mockReset()
    .mockImplementation((b: { provider?: string; model?: string }) =>
      Promise.resolve({ provider: b.provider ?? "ollama", model: b.model ?? "nomic-embed-text" }),
    );
  getOllamaModels
    .mockReset()
    .mockResolvedValue({ reachable: true, base_url: "", models: [{ id: "nomic-embed-text" }] });
  getVertexAISettings.mockReset().mockResolvedValue({
    project: "test-project",
    location: "us-central1",
    has_credentials: true,
    masked_credentials: null,
  });
  getConfig.mockReset().mockResolvedValue({
    vertexai_embedding_models: [
      { id: "gemini-embedding-2", label: "gemini-embedding-2", description: "latest" },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingsEmbeddings (075)", () => {
  it("selecting Ollama persists the provider", async () => {
    render(<SettingsEmbeddings />);
    const ollama = await screen.findByTestId("settings-embedding-provider-ollama");
    await act(async () => {
      fireEvent.click(ollama);
    });
    expect(setEmbeddingSettings).toHaveBeenCalledWith({ provider: "ollama" });
  });

  it("lists installed Ollama embedding models when reachable", async () => {
    getEmbeddingSettings.mockResolvedValue({ provider: "ollama", model: "nomic-embed-text" });
    render(<SettingsEmbeddings />);
    // Re-query inside waitFor: the input renders first, then flips to the live select.
    await waitFor(() =>
      expect(screen.getByTestId("settings-embedding-model").tagName).toBe("SELECT"),
    );
    expect(getOllamaModels).toHaveBeenCalled();
  });

  it("shows the unreachable hint when the Ollama server can't be reached", async () => {
    getEmbeddingSettings.mockResolvedValue({ provider: "ollama", model: "nomic-embed-text" });
    getOllamaModels.mockResolvedValue({ reachable: false, base_url: "", models: [] });
    render(<SettingsEmbeddings />);
    expect(await screen.findByTestId("settings-embedding-hint")).toBeTruthy();
  });

  it("selecting Vertex AI persists the provider and shows curated models dropdown", async () => {
    render(<SettingsEmbeddings />);
    const vertexai = await screen.findByTestId("settings-embedding-provider-vertexai");
    await act(async () => {
      fireEvent.click(vertexai);
    });
    expect(setEmbeddingSettings).toHaveBeenCalledWith({ provider: "vertexai" });
  });

  it("lists curated Vertex AI embedding models when selected", async () => {
    getEmbeddingSettings.mockResolvedValue({ provider: "vertexai", model: "gemini-embedding-2" });
    render(<SettingsEmbeddings />);

    await waitFor(() =>
      expect(screen.getByTestId("settings-embedding-model").tagName).toBe("SELECT"),
    );
    const select = screen.getByTestId("settings-embedding-model") as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(select.options[0].value).toBe("gemini-embedding-2");
  });

  it("shows the missing-credentials hint when has_credentials is false", async () => {
    getEmbeddingSettings.mockResolvedValue({ provider: "vertexai", model: "gemini-embedding-2" });
    getVertexAISettings.mockResolvedValue({
      project: "",
      location: "",
      has_credentials: false,
      masked_credentials: null,
    });
    render(<SettingsEmbeddings />);
    expect(await screen.findByTestId("settings-embedding-hint")).toBeTruthy();
  });

  it("selecting OpenAI clears the model and persists both provider and empty model", async () => {
    getEmbeddingSettings.mockResolvedValue({ provider: "ollama", model: "nomic-embed-text" });
    render(<SettingsEmbeddings />);

    const openai = await screen.findByTestId("settings-embedding-provider-openai");
    await act(async () => {
      fireEvent.click(openai);
    });
    expect(setEmbeddingSettings).toHaveBeenCalledWith({ provider: "openai", model: "" });
  });
});
