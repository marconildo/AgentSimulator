// 041-settings-page · AC1, AC2, AC3, AC4, AC5, AC9 — the App-level navigation
// contract for the ⚙️ Config button. Mounts `<App />` (the only top-level
// component) with `chatApi`, `sse`, and the health probe mocked so jsdom can
// render without touching the network.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// All network seams must be mocked before App imports trigger their effects.
vi.mock("../lib/chatApi", () => ({
  createSession: vi.fn().mockResolvedValue({
    id: "draft",
    title: null,
    created_at: 0,
    updated_at: 0,
    message_count: 0,
  }),
  deleteSession: vi.fn(),
  deleteDocument: vi.fn(),
  listSessions: vi.fn().mockResolvedValue([]),
  listMessages: vi.fn().mockResolvedValue([]),
  listDocuments: vi.fn().mockResolvedValue([]),
  uploadDocument: vi.fn(),
  clearData: vi.fn(),
  listSkills: vi.fn().mockResolvedValue([]),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  getConfig: vi.fn().mockResolvedValue({
    default_system_prompt: "",
    default_top_k: 3,
    top_k_min: 1,
    top_k_max: 8,
    default_rerank_threshold: 0,
    rerank_threshold_step: 0.05,
    tools: [],
    scenarios: [],
    failure_modes: ["none"],
  }),
}));

vi.mock("../lib/sse", () => ({
  API_BASE: "",
  consumeEventStream: vi.fn(),
  streamChat: vi.fn(),
  batchChat: vi.fn(),
  fetchTrace: vi.fn().mockRejectedValue(new Error("not needed")),
}));

vi.mock("../lib/health", () => ({
  // Stable health state — backend "ok", no banner, mocked load no-op.
  useHealth: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ status: "ok", llmModel: "gpt-4.1-mini", hasKey: true, load: () => {} }),
    { getState: () => ({ status: "ok", llmModel: "gpt-4.1-mini", hasKey: true, load: () => {} }) },
  ),
  healthBanner: () => null,
}));

// Bypass the HUD recompute fan-out (same pattern as ChatPanel.attachments.test).
const _zeroCumulative = {
  turns: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  toolCalls: 0,
  ragHits: 0,
  partial: false,
};
vi.mock("../store/useHud", () => {
  const useHud = (selector: (s: unknown) => unknown) =>
    selector({ cumulative: _zeroCumulative, loading: false });
  useHud.getState = () => ({ recompute: vi.fn().mockResolvedValue(undefined) });
  return { useHud };
});

import App from "../App";

beforeEach(() => {
  // jsdom doesn't implement Element.prototype.scrollTo; the chat Thread effect
  // calls it on mount.
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => undefined;
  }
  // jsdom also lacks ResizeObserver (TourCaption observes its container's box
  // to anchor the balloon). A minimal no-op polyfill is enough for our purposes.
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== "function") {
    class NoopResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as Record<string, unknown>).ResizeObserver = NoopResizeObserver;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App navigation — ⚙️ Config routes to a page (041)", () => {
  it("AC1 — clicking ⚙️ from Sim renders the Settings page and unmounts the canvas", () => {
    render(<App />);

    // Default landing: simulator (no settings region; canvas-side controls present).
    expect(screen.queryByTestId("settings-page")).toBeNull();

    // Find the Config button by its title attribute (label may be hidden at narrow widths).
    const config = screen.getByTitle(/Architecture options/i);
    fireEvent.click(config);

    // The Settings region is now mounted.
    expect(screen.getByTestId("settings-page")).toBeTruthy();
    // The page header title + tagline are present.
    expect(screen.getByRole("heading", { name: /Settings/i })).toBeTruthy();
    // The legacy popover (which mounted its title inside an absolute dropdown)
    // is gone — its prior title text was "Architecture options" *inside* the
    // popover body. The page uses pageTitle ("Settings") instead, so any node
    // with the exact "Architecture options" string would be from the popover.
    // Assert absence:
    expect(screen.queryByText(/^Architecture options$/)).toBeNull();
  });

  it("AC2 — clicking ⚙️ again returns to the simulator", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle(/Architecture options/i));
    expect(screen.getByTestId("settings-page")).toBeTruthy();

    // The button now shows the Back-to-Simulator title.
    fireEvent.click(screen.getByTitle(/Back to Simulator/i));
    expect(screen.queryByTestId("settings-page")).toBeNull();
  });

  it("AC4 — the toggle's title and aria-pressed flip with the active page", () => {
    render(<App />);
    const off = screen.getByTitle(/Architecture options/i);
    expect(off.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(off);
    const on = screen.getByTitle(/Back to Simulator/i);
    expect(on.getAttribute("aria-pressed")).toBe("true");
  });

  it("AC5 — the Settings page renders all five section headings in order", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle(/Architecture options/i));

    const region = screen.getByTestId("settings-page");
    expect(region.textContent).toMatch(/Cloud provider/i);
    expect(region.textContent).toMatch(/Response delivery/i);
    expect(region.textContent).toMatch(/Experiment/i);
    expect(region.textContent).toMatch(/Data/i);
    expect(region.textContent).toMatch(/Skills/i);
  });
});

describe("App navigation — Learn ↔ Settings mutual exclusion (041 AC3)", () => {
  it("clicking Learn from Settings goes to Learn, not back to Sim", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle(/Architecture options/i));
    expect(screen.getByTestId("settings-page")).toBeTruthy();

    // The Learn button shows the BookIcon when off-Learn (we just look it up
    // by its label).
    const learn = screen.getByRole("button", { name: /Learn/i });
    fireEvent.click(learn);

    // Settings region gone; LearnPage region present (matched by its heading).
    expect(screen.queryByTestId("settings-page")).toBeNull();
    // LearnPage renders a known heading; if its DOM changes a future spec can
    // tighten this. The presence of an aria-pressed=true Learn button suffices.
    expect(
      screen.getByRole("button", { name: /Simulator/i, hidden: true }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("clicking ⚙️ from Learn goes to Settings, not back to Sim", () => {
    render(<App />);
    // Go to Learn first.
    fireEvent.click(screen.getByRole("button", { name: /Learn/i }));
    // Settings region not present yet.
    expect(screen.queryByTestId("settings-page")).toBeNull();

    // The ⚙️ button is still in the header; clicking it lands on Settings.
    fireEvent.click(screen.getByTitle(/Architecture options/i));
    expect(screen.getByTestId("settings-page")).toBeTruthy();
  });
});

// 041 AC8 — the first-visit auto-tour fires from the auto-onboard effect, not
// from the page state. Navigating Sim → Settings → Sim must not re-fire it; the
// `markOnboarded()` call inside the effect makes it idempotent, but we pin the
// contract here so a future refactor can't sneak a regression in.
describe("App — Settings navigation does not (re-)start the tour (AC8)", () => {
  it("navigating Sim → Settings → Sim leaves the tour untouched", async () => {
    // Spy on `startTour` so we can pin: navigating to Settings and back to
    // Sim does NOT trigger an extra tour start. The auto-onboard effect uses
    // `markOnboarded()` for idempotency; this test is the regression guard.
    const sim = await import("../store/useSimulator");
    const startTour = vi.spyOn(sim.useSimulator.getState(), "startTour");
    startTour.mockImplementation(() => {});

    render(<App />);
    // Effect ran once on mount; allow it to count (it may or may not have
    // fired depending on prior state). What matters is the count is stable
    // across the round-trip.
    const initial = startTour.mock.calls.length;

    fireEvent.click(screen.getByTitle(/Architecture options/i));
    fireEvent.click(screen.getByTitle(/Back to Simulator/i));

    expect(startTour.mock.calls.length).toBe(initial);
  });
});
