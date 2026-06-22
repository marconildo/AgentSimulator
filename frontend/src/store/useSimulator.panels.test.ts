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

// 085-hop-communication-detail: selecting a hop is mutually exclusive with the
// station / traces selection and re-opens the Inspector (like `select`).
describe("hop selection (085)", () => {
  beforeEach(() => {
    useSimulator.setState({
      selected: null,
      selectedHop: null,
      tracesOpen: false,
      inspectorCollapsed: false,
    });
  });

  it("selectHop sets the hop and clears the station + traces selection", () => {
    useSimulator.setState({ selected: "backend", tracesOpen: true });
    useSimulator.getState().selectHop("frontend-edge");
    const s = useSimulator.getState();
    expect(s.selectedHop).toBe("frontend-edge");
    expect(s.selected).toBeNull();
    expect(s.tracesOpen).toBe(false);
  });

  it("selecting a station clears a selected hop (mutual exclusion)", () => {
    useSimulator.getState().selectHop("agent-llm");
    useSimulator.getState().select("agent");
    expect(useSimulator.getState().selected).toBe("agent");
    expect(useSimulator.getState().selectedHop).toBeNull();
  });

  it("opening traces clears a selected hop", () => {
    useSimulator.getState().selectHop("agent-mcp");
    useSimulator.getState().openTraces();
    expect(useSimulator.getState().tracesOpen).toBe(true);
    expect(useSimulator.getState().selectedHop).toBeNull();
  });

  it("selecting a hop re-opens a collapsed Inspector", () => {
    useSimulator.setState({ inspectorCollapsed: true });
    useSimulator.getState().selectHop("backend-database");
    expect(useSimulator.getState().inspectorCollapsed).toBe(false);
  });
});
