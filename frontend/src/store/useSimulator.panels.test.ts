import { beforeEach, describe, expect, it } from "vitest";

import { useSimulator } from "./useSimulator";

// 013-canvas-space-disclosure: side-panel collapse + auto-open Inspector on
// select. Store-level (pure) coverage for AC1–AC4.
describe("side panel collapse (013)", () => {
  beforeEach(() => {
    useSimulator.setState({ chatCollapsed: false, inspectorCollapsed: false, selected: null });
  });

  it("AC1: panels are open by default", () => {
    const s = useSimulator.getState();
    expect(s.chatCollapsed).toBe(false);
    expect(s.inspectorCollapsed).toBe(false);
  });

  it("AC2: toggles flip the two panels independently", () => {
    useSimulator.getState().toggleChat();
    expect(useSimulator.getState().chatCollapsed).toBe(true);
    expect(useSimulator.getState().inspectorCollapsed).toBe(false);

    useSimulator.getState().toggleInspector();
    expect(useSimulator.getState().inspectorCollapsed).toBe(true);
    expect(useSimulator.getState().chatCollapsed).toBe(true);
  });

  it("AC3: selecting a station re-opens a collapsed Inspector", () => {
    useSimulator.setState({ inspectorCollapsed: true });
    useSimulator.getState().select("backend");
    expect(useSimulator.getState().selected).toBe("backend");
    expect(useSimulator.getState().inspectorCollapsed).toBe(false);
  });

  it("AC4: deselecting (null) never forces the Inspector open", () => {
    useSimulator.setState({ inspectorCollapsed: true });
    useSimulator.getState().select(null);
    expect(useSimulator.getState().selected).toBeNull();
    expect(useSimulator.getState().inspectorCollapsed).toBe(true);
  });
});
