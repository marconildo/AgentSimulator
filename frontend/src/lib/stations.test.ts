import { describe, expect, it } from "vitest";

import { stationForEvent, stationsFor } from "./stations";

describe("station tech rows", () => {
  it("never bakes a model literal into the static visual model (B2)", () => {
    // A model string hardcoded here drifts from the real one the moment LLM_MODEL
    // changes in the env — exactly the gpt-4o-mini vs gpt-4.1-mini mismatch the
    // assessment caught. The LLM block must read its model live from /api/health.
    for (const station of stationsFor("en")) {
      for (const row of station.tech) {
        expect(row.v).not.toMatch(/gpt-\d/i);
      }
    }
  });
});

describe("stationForEvent (B5)", () => {
  it("maps a phase's first event to the station that owns its stage", () => {
    expect(stationForEvent([{ stage: "db.read" }], 0)).toBe("database");
    expect(stationForEvent([{ stage: "rag.retrieve" }], 0)).toBe("rag");
    expect(stationForEvent([{ stage: "mcp.call" }], 0)).toBe("mcp");
    expect(stationForEvent([{ stage: "llm.generate" }], 0)).toBe("llm");
  });

  it("returns undefined for an out-of-range index", () => {
    expect(stationForEvent([], 3)).toBeUndefined();
  });
});
