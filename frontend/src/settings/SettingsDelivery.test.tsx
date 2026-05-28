// 041-settings-page · AC6a regression — the streaming/batch toggle still wires
// `useSettings.mode` after the section is lifted out of `SettingsPanel.tsx`.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SettingsDelivery } from "./SettingsDelivery";
import { useSettings } from "../lib/settings";

beforeEach(() => {
  useSettings.setState({ mode: "stream" });
});

afterEach(() => {
  cleanup();
});

describe("SettingsDelivery — AC6a", () => {
  it("clicking 'Batch (JSON)' flips useSettings.mode to 'batch'", () => {
    render(<SettingsDelivery />);
    const batch = screen.getByRole("button", { name: /Batch \(JSON\)/i });
    fireEvent.click(batch);
    expect(useSettings.getState().mode).toBe("batch");
  });

  it("clicking 'Streaming (SSE)' flips useSettings.mode back to 'stream'", () => {
    useSettings.setState({ mode: "batch" });
    render(<SettingsDelivery />);
    const stream = screen.getByRole("button", { name: /Streaming \(SSE\)/i });
    fireEvent.click(stream);
    expect(useSettings.getState().mode).toBe("stream");
  });
});
