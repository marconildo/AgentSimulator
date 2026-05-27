// 032-network-boundary (AC1) — the public-internet / egress frontier geometry:
// a thin vertical line in the gap between the client tier's right edge and the
// private boundary's left edge, spanning the boundary's vertical extent, in every
// scenario, overlapping neither box.

import { describe, expect, it } from "vitest";

import { computeLayout } from "./layout";
import type { Scenario } from "./scenario";

const SCENARIOS: Scenario[] = ["simple", "intermediate", "advanced"];

describe("public frontier geometry (032-network-boundary AC1)", () => {
  for (const scenario of SCENARIOS) {
    it(`sits between the client tier and the private boundary in ${scenario}`, () => {
      const layout = computeLayout(new Set(), scenario);
      const f = layout.publicFrontier;
      const clientRight = layout.tierBoxes.client.x + layout.tierBoxes.client.w;
      const boundaryLeft = layout.boundary.x;

      // Strictly between the client tier's right edge and the boundary's left edge.
      expect(f.x).toBeGreaterThan(clientRight);
      expect(f.x).toBeLessThan(boundaryLeft);

      // Spans the private boundary's vertical extent.
      expect(f.y).toBeCloseTo(layout.boundary.y, 0);
      expect(f.h).toBeCloseTo(layout.boundary.h, 0);
    });
  }
});
