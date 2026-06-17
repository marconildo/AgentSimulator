// 063-mobile-demo-layout (AC3–AC7) — the phone-only tabbed shell: one pane
// visible, the rest mounted-but-hidden; Diagram default; tap-to-switch; select a
// station → Inspector; ≥44px touch targets.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MobileShell } from "./MobileShell";
import { UI } from "../i18n/strings";
import { useSimulator } from "../store/useSimulator";

const tab = UI.en.mobile.tab;

function renderShell() {
  return render(
    <MobileShell
      chat={<div>CHAT-PANE</div>}
      canvas={<div>CANVAS-PANE</div>}
      inspector={<div>INSPECTOR-PANE</div>}
      timeline={<div>TIMELINE</div>}
    />,
  );
}

beforeEach(() => {
  useSimulator.setState({ selected: null });
});

afterEach(() => {
  cleanup();
  useSimulator.setState({ selected: null });
});

describe("MobileShell", () => {
  it("defaults to the Diagram pane (AC5) and keeps all panes mounted (AC3)", () => {
    renderShell();
    // All three panes are in the DOM regardless of which is active.
    expect(screen.getByText("CHAT-PANE")).toBeTruthy();
    expect(screen.getByText("CANVAS-PANE")).toBeTruthy();
    expect(screen.getByText("INSPECTOR-PANE")).toBeTruthy();

    // Exactly one pane visible: Diagram is shown, the other two are CSS-hidden.
    expect(screen.getByTestId("pane-canvas").className).not.toContain("hidden");
    expect(screen.getByTestId("pane-chat").className).toContain("hidden");
    expect(screen.getByTestId("pane-inspector").className).toContain("hidden");

    const canvasTab = screen.getByRole("tab", { name: new RegExp(tab.canvas) });
    expect(canvasTab.getAttribute("aria-selected")).toBe("true");
  });

  it("switches the visible pane when a tab is clicked (AC4)", () => {
    renderShell();
    const chatTab = screen.getByRole("tab", { name: new RegExp(tab.chat) });
    act(() => chatTab.click());

    expect(screen.getByTestId("pane-chat").className).not.toContain("hidden");
    expect(screen.getByTestId("pane-canvas").className).toContain("hidden");
    expect(chatTab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("tab", { name: new RegExp(tab.canvas) }).getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("auto-switches to the Inspector pane when a station is selected (AC6)", () => {
    renderShell();
    expect(screen.getByTestId("pane-inspector").className).toContain("hidden");

    act(() => useSimulator.setState({ selected: "agent" }));

    expect(screen.getByTestId("pane-inspector").className).not.toContain("hidden");
    expect(
      screen.getByRole("tab", { name: new RegExp(tab.inspector) }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("gives every tab control a ≥44px touch target (AC7)", () => {
    renderShell();
    for (const t of screen.getAllByRole("tab")) {
      expect(t.className).toContain("min-h-[44px]");
    }
  });

  it("ships every tab label in en and pt (AC9)", () => {
    for (const lang of ["en", "pt"] as const) {
      const labels = UI[lang].mobile.tab;
      expect(labels.canvas.trim()).not.toBe("");
      expect(labels.chat.trim()).not.toBe("");
      expect(labels.inspector.trim()).not.toBe("");
    }
  });
});
