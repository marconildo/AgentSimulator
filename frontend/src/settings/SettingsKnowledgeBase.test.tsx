// 081-chunking-config — selecting a strategy renders exactly its relevant parameter
// controls (seeded from /api/config defaults), and re-ingest sends the edited values.

/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();
const reindexCorpus = vi.fn();

vi.mock("../lib/chatApi", () => ({
  getConfig: (...a: unknown[]) => getConfig(...a),
  reindexCorpus: (...a: unknown[]) => reindexCorpus(...a),
}));

import { SettingsKnowledgeBase } from "./SettingsKnowledgeBase";

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
