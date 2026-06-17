// 056-ragless-pageindex — the RAGLESS (PageIndex) box and its hop are hidden by
// default and revealed only when the RAGLESS strategy is selected. 066-retrieval-strategy-radio
// made retrieval a radio (vector ⊻ ragless): pageindex is visible iff the strategy is
// `ragless` (it maps to the `pageindex` station), and the vector `rag` station is then hidden.

import { describe, expect, it } from "vitest";

import { DEFAULT_SELECTION, selectionOf } from "./selection";
import {
  STAGE_TO_STATION,
  stationByIdFor,
  visibleHopsFor,
  visibleStationIdsFor,
} from "./stations";

const RAGLESS_SEL = selectionOf(["mcp"], "react", "ragless");

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

describe("station visibility gated by the RAGLESS component (AC2, AC6)", () => {
  it("hides pageindex by default", () => {
    const ids = new Set(visibleStationIdsFor(DEFAULT_SELECTION));
    expect(ids.has("pageindex")).toBe(false);
    // the rest of the data column is unaffected
    expect(ids.has("rag")).toBe(true);
  });

  it("reveals pageindex when the RAGLESS strategy is selected, and hides the vector rag station", () => {
    const ids = new Set(visibleStationIdsFor(RAGLESS_SEL));
    expect(ids.has("pageindex")).toBe(true);
    // 066 — retrieval is a radio: picking RAGLESS hides Vector RAG.
    expect(ids.has("rag")).toBe(false);
  });
});

describe("hop visibility gated by the RAGLESS component (AC6)", () => {
  it("hides the agent→pageindex hop by default", () => {
    const hops = visibleHopsFor("en", DEFAULT_SELECTION);
    expect(hops.some((h) => h.source === "agent" && h.target === "pageindex")).toBe(false);
    // the vector hop is still present
    expect(hops.some((h) => h.source === "agent" && h.target === "rag")).toBe(true);
  });

  it("shows the agent→pageindex hop when the RAGLESS component is selected", () => {
    const hops = visibleHopsFor("en", RAGLESS_SEL);
    expect(hops.some((h) => h.source === "agent" && h.target === "pageindex")).toBe(true);
  });
});
