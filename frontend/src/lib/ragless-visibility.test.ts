// 056-ragless-pageindex — the RAGLESS (PageIndex) box and its hop are hidden by
// default and revealed only when the `ragless` toggle is on (the `showRagless`
// layout flag), on the Intermediate rung where the box's scenario membership lives.
// AC2 (Intermediate-only) + AC6 (conditional box).

import { describe, expect, it } from "vitest";

import {
  STAGE_TO_STATION,
  stationByIdFor,
  visibleHopsFor,
  visibleStationIdsFor,
} from "./stations";

describe("pageindex station mapping (AC5, AC6)", () => {
  it("owns exactly the three pageindex.* stages in STAGE_TO_STATION", () => {
    expect(STAGE_TO_STATION["pageindex.tree"]).toBe("pageindex");
    expect(STAGE_TO_STATION["pageindex.navigate"]).toBe("pageindex");
    expect(STAGE_TO_STATION["pageindex.select"]).toBe("pageindex");
  });

  it("is a real, executing station (not a coming-soon preview) in the data tier", () => {
    const meta = stationByIdFor("en").pageindex;
    expect(meta).toBeTruthy();
    expect(meta.tier).toBe("services");
    expect(meta.comingSoon).toBeFalsy();
    expect(meta.scenarios).toEqual(["intermediate", "advanced"]);
  });
});

describe("station visibility gated by showRagless (AC2, AC6)", () => {
  it("hides pageindex by default on the Intermediate rung", () => {
    const ids = new Set(visibleStationIdsFor("intermediate"));
    expect(ids.has("pageindex")).toBe(false);
    // the rest of the data column is unaffected
    expect(ids.has("rag")).toBe(true);
  });

  it("reveals pageindex when showRagless is set (Intermediate)", () => {
    const ids = new Set(visibleStationIdsFor("intermediate", false, true));
    expect(ids.has("pageindex")).toBe(true);
  });

  it("never shows pageindex on the Simple rung even when showRagless is set", () => {
    const ids = new Set(visibleStationIdsFor("simple", false, true));
    expect(ids.has("pageindex")).toBe(false);
  });
});

describe("hop visibility gated by showRagless (AC6)", () => {
  it("hides the agent→pageindex hop by default", () => {
    const hops = visibleHopsFor("en", "intermediate");
    expect(hops.some((h) => h.source === "agent" && h.target === "pageindex")).toBe(false);
    // the vector hop is still present
    expect(hops.some((h) => h.source === "agent" && h.target === "rag")).toBe(true);
  });

  it("shows the agent→pageindex hop when showRagless is set", () => {
    const hops = visibleHopsFor("en", "intermediate", false, true);
    expect(hops.some((h) => h.source === "agent" && h.target === "pageindex")).toBe(true);
  });
});
