// 075-ollama-embeddings — AC6 — the Embeddings (RAG) section persists the
// provider/model and lists installed Ollama models; an unreachable server shows
// the hint. Instance-wide (not per-agent).

/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setEmbeddingSettings = vi.fn();
const getEmbeddingSettings = vi.fn();
const getOllamaModels = vi.fn();

vi.mock("../lib/chatApi", () => ({
  getEmbeddingSettings: (...a: unknown[]) => getEmbeddingSettings(...a),
  setEmbeddingSettings: (...a: unknown[]) => setEmbeddingSettings(...a),
  getOllamaModels: (...a: unknown[]) => getOllamaModels(...a),
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
});
