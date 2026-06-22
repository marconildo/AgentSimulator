// 088-network-layer — AC3 — the Build "Network" component is gated on the real
// ingress chain being present (`/api/config.network_available`): disabled with a
// bilingual tooltip when absent, an ordinary toggle when present.

/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSelection } from "../lib/selection";

let networkAvailable = false;
vi.mock("../lib/chatApi", () => ({
  getConfig: () => Promise.resolve({ network_available: networkAvailable }),
}));

import { ScenarioBuilder } from "./ScenarioBuilder";

function openAndFindNetworkButton(): HTMLButtonElement {
  // The trigger is the first button; clicking it opens the (portaled) popover.
  fireEvent.click(screen.getAllByRole("button")[0]);
  const label = screen.getByText("Network");
  return label.closest("button") as HTMLButtonElement;
}

describe("ScenarioBuilder — network availability gate (088)", () => {
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({ enabled: new Set(["mcp"]), runtime: "react", retrieval: "vector" });
  });
  afterEach(cleanup);

  it("disables the Network toggle with the Docker tooltip when the chain is absent", async () => {
    networkAvailable = false;
    render(<ScenarioBuilder />);
    const btn = openAndFindNetworkButton();
    await waitFor(() => expect(btn.disabled).toBe(true));
    expect(btn.getAttribute("title")).toMatch(/Docker/i);
  });

  it("enables the Network toggle when the chain is present", async () => {
    networkAvailable = true;
    render(<ScenarioBuilder />);
    const btn = openAndFindNetworkButton();
    await waitFor(() => expect(btn.disabled).toBe(false));

    // Toggling it on adds `network` to the selection (and derives Advanced).
    fireEvent.click(btn);
    expect(useSelection.getState().enabled.has("network")).toBe(true);
  });
});
