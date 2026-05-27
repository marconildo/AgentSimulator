// 014-tour-scripted (AC6) — guard the bundled canned trace. It must be a real,
// playable run: every event maps to a station via the single source of truth
// (STAGE_TO_STATION), and projecting the whole log reaches a finished, settled
// run with a non-empty answer. If the event protocol (§1) drifts, this fails
// loud and the trace must be re-captured (see tourTrace.ts provenance).

import { describe, expect, it } from "vitest";

import { deriveView } from "./derive";
import { STAGE_TO_STATION } from "./stations";
import { tourTrace } from "./tourTrace";

describe("tourTrace — bundled canned trace (014 AC6)", () => {
  it("is a non-empty captured run", () => {
    expect(tourTrace.length).toBeGreaterThan(0);
  });

  it("every event's stage maps to a station via STAGE_TO_STATION", () => {
    for (const ev of tourTrace) {
      expect(STAGE_TO_STATION[ev.stage], ev.stage).toBeTruthy();
    }
  });

  it("projects to a finished, settled run with a non-empty answer", () => {
    const view = deriveView(tourTrace, tourTrace.length - 1);
    expect(view.activeStation).toBeNull();
    expect(view.activeHops).toHaveLength(0);
    expect(view.streaming).toBe(false);
    expect(view.answer.length).toBeGreaterThan(0);
  });

  it("exercises the full pipeline including a tool call (mcp.call present)", () => {
    expect(tourTrace.some((e) => e.stage === "mcp.call")).toBe(true);
  });
});
