// 081-chunking-config — selecting a strategy renders exactly its relevant parameter
// controls (seeded from /api/config defaults), and re-ingest sends the edited values.

/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();
const reindexCorpus = vi.fn();
const chunkPreview = vi.fn();

vi.mock("../lib/chatApi", () => ({
  getConfig: (...a: unknown[]) => getConfig(...a),
  reindexCorpus: (...a: unknown[]) => reindexCorpus(...a),
  chunkPreview: (...a: unknown[]) => chunkPreview(...a),
}));

import { SettingsKnowledgeBase } from "./SettingsKnowledgeBase";

// A live-example payload for the requested strategy (082).
function previewOf(strategy: unknown, error?: string) {
  return Promise.resolve({
    sample_chars: 120,
    previews: [
      {
        strategy,
        count: error ? 0 : 2,
        error,
        chunks: error
          ? []
          : [
              { text: "Vectors capture meaning.", start: 0, end: 24, chars: 24 },
              { text: "Cosine ranks them.", start: 24, end: 42, chars: 18 },
            ],
      },
    ],
  });
}

const CONFIG = {
  chunk_strategy: "recursive",
  chunk_strategies: ["recursive", "fixed", "semantic", "agentic"],
  chunk_params: {
    fixed: {
      chunk_size: { default: 900, min: 100, max: 4000 },
      chunk_overlap: { default: 150, min: 0, max: 1000 },
    },
    recursive: {
      chunk_size: { default: 900, min: 100, max: 4000 },
      chunk_overlap: { default: 150, min: 0, max: 1000 },
    },
    semantic: {
      semantic_threshold: { default: 0.5, min: 0, max: 1 },
      chunk_size: { default: 900, min: 100, max: 4000 },
    },
    agentic: {
      max_segments: { default: 12, min: 1, max: 50 },
    },
  },
};

beforeEach(() => {
  getConfig.mockReset().mockResolvedValue(CONFIG);
  reindexCorpus.mockReset().mockResolvedValue(undefined);
  chunkPreview.mockReset().mockImplementation((strategy: unknown) => previewOf(strategy));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingsKnowledgeBase params (081)", () => {
  it("AC9 — recursive (default) shows size + overlap, seeded from config", async () => {
    render(<SettingsKnowledgeBase />);
    const size = (await screen.findByTestId("kb-param-chunk_size")) as HTMLInputElement;
    const overlap = screen.getByTestId("kb-param-chunk_overlap") as HTMLInputElement;
    expect(size.value).toBe("900");
    expect(overlap.value).toBe("150");
    // Recursive has no threshold / max-segments control.
    expect(screen.queryByTestId("kb-param-semantic_threshold")).toBeNull();
    expect(screen.queryByTestId("kb-param-max_segments")).toBeNull();
  });

  it("AC9 — selecting agentic swaps to just the max-segments control", async () => {
    render(<SettingsKnowledgeBase />);
    await screen.findByTestId("kb-param-chunk_size");
    fireEvent.click(screen.getByRole("button", { name: /Agentic/i }));
    const seg = (await screen.findByTestId("kb-param-max_segments")) as HTMLInputElement;
    expect(seg.value).toBe("12");
    expect(screen.queryByTestId("kb-param-chunk_size")).toBeNull();
    expect(screen.queryByTestId("kb-param-chunk_overlap")).toBeNull();
  });

  it("AC9 — selecting semantic shows threshold + size", async () => {
    render(<SettingsKnowledgeBase />);
    await screen.findByTestId("kb-param-chunk_size");
    fireEvent.click(screen.getByRole("button", { name: /Semantic/i }));
    const th = (await screen.findByTestId("kb-param-semantic_threshold")) as HTMLInputElement;
    expect(th.value).toBe("0.5");
    expect(screen.getByTestId("kb-param-chunk_size")).toBeTruthy();
    expect(screen.queryByTestId("kb-param-chunk_overlap")).toBeNull();
  });

  it("strategy-1 hint — appears only when the chosen strategy differs from the active one", async () => {
    render(<SettingsKnowledgeBase />);
    await screen.findByTestId("kb-param-chunk_size");
    // active === chosen === recursive at load → no pending-selection hint.
    expect(screen.queryByTestId("kb-apply-hint")).toBeNull();
    // Pick a different strategy → the "re-ingest to apply" hint shows.
    fireEvent.click(screen.getByRole("button", { name: /Semantic/i }));
    const hint = await screen.findByTestId("kb-apply-hint");
    expect(hint.textContent).toMatch(/re-ingest/i);
    // Back to the active strategy → the hint goes away again.
    fireEvent.click(screen.getByRole("button", { name: /Recursive/i }));
    expect(screen.queryByTestId("kb-apply-hint")).toBeNull();
  });

  // --- 082-chunking-explainers ----------------------------------------------

  it("082 AC1 — each strategy shows its distinct 'how it works' explanation", async () => {
    render(<SettingsKnowledgeBase />);
    const text = (await screen.findByTestId("kb-explain-text")) as HTMLElement;
    const recursive = text.textContent ?? "";
    expect(recursive).toMatch(/paragraph/i); // recursive default copy

    fireEvent.click(screen.getByRole("button", { name: /Semantic/i }));
    await waitFor(() =>
      expect(screen.getByTestId("kb-explain-text").textContent).toMatch(/similarity|topic/i),
    );
    // The explanation actually changed with the selection.
    expect(screen.getByTestId("kb-explain-text").textContent).not.toBe(recursive);

    fireEvent.click(screen.getByRole("button", { name: /Agentic/i }));
    await waitFor(() =>
      expect(screen.getByTestId("kb-explain-text").textContent).toMatch(/LLM|segment/i),
    );
  });

  it("082 AC2 — renders a real live example of the selected strategy (chunks + chars)", async () => {
    render(<SettingsKnowledgeBase />);
    await screen.findByTestId("kb-param-chunk_size");
    await waitFor(() => expect(chunkPreview).toHaveBeenCalledWith("recursive"));
    const ex = await screen.findByTestId("kb-explain-example");
    expect(ex.textContent).toMatch(/Vectors capture meaning/);
    expect(ex.textContent).toMatch(/24c/); // char count rendered by the reused ChunkColumn

    fireEvent.click(screen.getByRole("button", { name: /Semantic/i }));
    await waitFor(() => expect(chunkPreview).toHaveBeenCalledWith("semantic"));
  });

  it("082 AC3 — a preview error shows the honest message and no fabricated chunks", async () => {
    chunkPreview.mockImplementation((s: unknown) => previewOf(s, "OPENAI_API_KEY required"));
    render(<SettingsKnowledgeBase />);
    const ex = await screen.findByTestId("kb-explain-example");
    expect(ex.textContent).toMatch(/OPENAI_API_KEY required/);
    expect(ex.textContent).not.toMatch(/Vectors capture meaning/);
  });

  it("AC10 — editing a param + re-ingest sends it to the backend", async () => {
    render(<SettingsKnowledgeBase />);
    const size = (await screen.findByTestId("kb-param-chunk_size")) as HTMLInputElement;
    fireEvent.change(size, { target: { value: "400" } });
    fireEvent.click(screen.getByTestId("settings-reingest"));
    await waitFor(() => expect(reindexCorpus).toHaveBeenCalled());
    const call = reindexCorpus.mock.calls[0];
    expect(call[0]).toBe("recursive");
    // params object is the 4th arg.
    expect(call[3]).toMatchObject({ chunk_size: 400, chunk_overlap: 150 });
  });
});
