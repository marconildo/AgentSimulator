// 032-network-boundary (AC1) — the public-internet / egress frontier geometry:
// a thin vertical line in the gap between the client tier's right edge and the
// private boundary's left edge, spanning the boundary's vertical extent, in every
// scenario, overlapping neither box.

import { describe, expect, it } from "vitest";

import { computeLayout } from "./layout";
import type { Scenario } from "./scenario";

const SCENARIOS: Scenario[] = ["simple", "intermediate", "advanced"];

describe("upload nodes hidden by default (035-conditional-upload-nodes AC5)", () => {
  for (const scenario of SCENARIOS) {
    it(`omits storage + ingestion from the layout in ${scenario} with no upload`, () => {
      const layout = computeLayout(new Set(), scenario);
      expect(layout.positions.storage).toBeUndefined();
      expect(layout.positions.ingestion).toBeUndefined();
      // the query-path data nodes are still laid out
      expect(layout.positions.rag).toBeDefined();
      expect(layout.positions.database).toBeDefined();
    });
  }
});

describe("storage write-path placement (034 AC7 · shown with showUpload)", () => {
  for (const scenario of SCENARIOS) {
    it(`stacks storage → ingestion → rag downward inside the services tier in ${scenario}`, () => {
      const layout = computeLayout(new Set(), scenario, true);
      const { positions, heights, tierBoxes } = layout;

      // All three present and stacked in write-path order so the upload edges
      // flow downward (source-bottom → target-top).
      expect(positions.storage).toBeDefined();
      expect(positions.storage.y).toBeLessThan(positions.ingestion.y);
      expect(positions.ingestion.y).toBeLessThan(positions.rag.y);

      // Stacked, never overlapping its upper neighbour (database) or the next node.
      expect(positions.storage.y).toBeGreaterThanOrEqual(
        positions.database.y + heights.database,
      );
      expect(positions.ingestion.y).toBeGreaterThanOrEqual(
        positions.storage.y + heights.storage,
      );

      // The services tier box wraps storage (a member of that tier).
      const box = tierBoxes.services;
      expect(positions.storage.x).toBeGreaterThanOrEqual(box.x);
      expect(positions.storage.y + heights.storage).toBeLessThanOrEqual(box.y + box.h);
    });
  }
});

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
