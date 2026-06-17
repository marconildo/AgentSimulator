// 063-mobile-demo-layout (AC2, AC8, AC10) — the layout chooser in App: the
// single-pane tab shell appears ONLY when `isDemo() && mobile`; the live build
// and the demo-at-desktop keep the three-column layout. Header wraps in mobile.
//
// App pulls in a large tree, so we stub the leaf panels/toggles and the
// network/health layer, keeping the real `MobileShell` + `SidePanel` (the actual
// units under test) so the branch decision is exercised honestly.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/ChatPanel", () => ({ ChatPanel: () => <div>CHAT</div> }));
vi.mock("./components/FlowCanvas", () => ({ FlowCanvas: () => <div>CANVAS</div> }));
vi.mock("./components/InspectorPanel", () => ({ InspectorPanel: () => <div>INSPECTOR</div> }));
vi.mock("./components/Timeline", () => ({ Timeline: () => <div>TIMELINE</div> }));
vi.mock("./components/TourCaption", () => ({ TourCaption: () => <div>TOUR</div> }));
vi.mock("./components/AgentDetail", () => ({ AgentDetail: () => <div>AGENT-DETAIL</div> }));
vi.mock("./components/RagPipelinePanel", () => ({ RagPipelinePanel: () => <div>RAG</div> }));
vi.mock("./components/PageIndexPipelinePanel", () => ({
  PageIndexPipelinePanel: () => <div>PAGEINDEX</div>,
}));
vi.mock("./components/AgentAnatomyDialog", () => ({ AgentAnatomyDialog: () => <div>ANATOMY</div> }));
vi.mock("./components/AgentConfigToggle", () => ({ AgentConfigToggle: () => <div>AGENT-CFG</div> }));
vi.mock("./components/CloudToggle", () => ({ CloudToggle: () => <div>CLOUD</div> }));
vi.mock("./components/ConfigToggle", () => ({ ConfigToggle: () => <div>CONFIG</div> }));
vi.mock("./components/DemoBanner", () => ({ DemoBanner: () => <div>BANNER</div> }));
vi.mock("./components/LanguageToggle", () => ({ LanguageToggle: () => <div>LANG</div> }));
vi.mock("./components/ScenarioBuilder", () => ({ ScenarioBuilder: () => <div>BUILDER</div> }));
vi.mock("./components/ThemeToggle", () => ({ ThemeToggle: () => <div>THEME</div> }));
vi.mock("./learn/LearnPage", () => ({ LearnPage: () => <div>LEARN</div> }));
vi.mock("./settings/SettingsPage", () => ({ SettingsPage: () => <div>SETTINGS</div> }));

vi.mock("./lib/health", () => ({
  healthBanner: () => null,
  useHealth: (sel: (s: unknown) => unknown) =>
    sel({ status: "idle", llmModel: null, hasKey: false, load: () => {} }),
}));
vi.mock("./lib/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/onboarding")>()),
  shouldAutoOnboard: () => false,
}));

import App from "./App";

/** Stub `window.matchMedia` so `useIsMobile()` reports the desired viewport. */
function setViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: mobile,
      media: "(max-width: 767px)",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

beforeEach(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("App layout chooser (063)", () => {
  it("renders the single-pane tab shell in a demo build at mobile width (AC2)", () => {
    vi.stubEnv("VITE_DEMO_MODE", "1");
    setViewport(true);
    render(<App />);
    expect(screen.queryByRole("tablist")).not.toBeNull();
  });

  it("wraps the header in the demo+mobile layout (AC8)", () => {
    vi.stubEnv("VITE_DEMO_MODE", "1");
    setViewport(true);
    const { container } = render(<App />);
    const header = container.querySelector("header");
    expect(header?.className).toContain("flex-wrap");
  });

  it("keeps the three-column layout (no tab bar) in a demo build at desktop width (AC2)", () => {
    vi.stubEnv("VITE_DEMO_MODE", "1");
    setViewport(false);
    const { container } = render(<App />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(container.querySelector("header")?.className).not.toContain("flex-wrap");
  });

  it("never mounts the mobile shell in a non-demo build, even at mobile width (AC10)", () => {
    vi.stubEnv("VITE_DEMO_MODE", "");
    setViewport(true);
    render(<App />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
