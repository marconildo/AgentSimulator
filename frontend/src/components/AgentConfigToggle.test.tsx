// Header-level "Configure agent" button. Replaces the secondary affordance
// previously buried inside the Agent station's expanded body (042-agent-anatomy),
// surfacing the dialog from anywhere in the app. Behavior-preserving UI refactor
// — the dialog itself is unchanged.

/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentConfigToggle } from "./AgentConfigToggle";
import { useAgentAnatomy } from "../lib/agentAnatomy";

beforeEach(() => {
  useAgentAnatomy.setState({ open: false, initialSection: null });
});

afterEach(() => {
  cleanup();
  useAgentAnatomy.setState({ open: false, initialSection: null });
});

describe("AgentConfigToggle (header button)", () => {
  it("renders a button whose accessible name carries the 'Configure agent' label", () => {
    render(<AgentConfigToggle />);
    // The visible text label is hidden at narrow widths; the aria-label always
    // carries the action so screen readers (and tests) can find it.
    expect(screen.getByRole("button", { name: /Configure agent/i })).toBeTruthy();
  });

  it("clicking the button flips the dialog open", () => {
    render(<AgentConfigToggle />);
    expect(useAgentAnatomy.getState().open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Configure agent/i }));

    expect(useAgentAnatomy.getState().open).toBe(true);
    // No anchor section requested — opens at the top of the dialog.
    expect(useAgentAnatomy.getState().initialSection).toBeNull();
  });
});
