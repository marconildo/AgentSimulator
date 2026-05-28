import { beforeEach, describe, expect, it } from "vitest";

import { useSimulator } from "./useSimulator";

// 037-first-visit-onboarding (AC4) — the tour selects stations WITHOUT forcing the
// Inspector open, so a first-visit collapsed Inspector stays collapsed through the
// auto-tour (the balloon narration teaches). A manual click still reveals it, so
// 013 AC3 is unchanged.
describe("tour-select preserves canvas emphasis (037 AC4)", () => {
  beforeEach(() => {
    useSimulator.setState({ inspectorCollapsed: true, selected: null });
  });

  it("select(id, { reveal: false }) sets the station but keeps a collapsed Inspector", () => {
    useSimulator.getState().select("agent", { reveal: false });
    expect(useSimulator.getState().selected).toBe("agent");
    expect(useSimulator.getState().inspectorCollapsed).toBe(true);
  });

  it("select(id) (default reveal) re-opens a collapsed Inspector (013 AC3)", () => {
    useSimulator.getState().select("rag");
    expect(useSimulator.getState().selected).toBe("rag");
    expect(useSimulator.getState().inspectorCollapsed).toBe(false);
  });
});
