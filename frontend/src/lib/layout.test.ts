// 032-network-boundary (AC1) — the public-internet / egress frontier geometry:
// a thin vertical line in the gap between the client tier's right edge and the
// private boundary's left edge, spanning the boundary's vertical extent, in every
// scenario, overlapping neither box.

import { describe, expect, it } from "vitest";

import { computeLayout } from "./layout";
import { DEFAULT_SELECTION, type ResolvedSelection, selectionOf } from "./selection";

// Representative selections spanning the maturity range (061-scenario-builder).
const SELECTIONS: { name: string; sel: ResolvedSelection }[] = [
  { name: "default (simple)", sel: DEFAULT_SELECTION },
  {
    name: "rich (intermediate)",
    sel: selectionOf(["mcp", "rerank", "hybrid", "summarization"], "deepagents", "vector"),
  },
  {
    name: "full (advanced)",
    sel: selectionOf(
      ["mcp", "gateway", "guardrails", "cache", "eval", "observability"],
      "multiagent",
      "vector",
    ),
  },
];

describe("upload nodes hidden by default (035-conditional-upload-nodes AC5)", () => {
  for (const { name, sel } of SELECTIONS) {
    it(`omits storage + ingestion from the layout in ${name} with no upload`, () => {
      const layout = computeLayout(new Set(), sel);
      expect(layout.positions.storage).toBeUndefined();
      expect(layout.positions.ingestion).toBeUndefined();
      // the query-path data nodes are still laid out
      expect(layout.positions.rag).toBeDefined();
      expect(layout.positions.database).toBeDefined();
    });
  }
});

describe("storage write-path placement (034 AC7 · shown with showUpload)", () => {
  for (const { name, sel } of SELECTIONS) {
    it(`stacks storage → ingestion → rag downward inside the services tier in ${name}`, () => {
      const layout = computeLayout(new Set(), sel, true);
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

describe("intermediate preview tiles placement (060 AC7)", () => {
  it("lays out hybrid directly below the RAG node as a retrieval extension", () => {
    const sel = selectionOf(["mcp", "hybrid"]);
    const { positions, heights, tierBoxes } = computeLayout(new Set(), sel);
    expect(positions.hybrid).toBeDefined();
    // 060 amendment — Hybrid Search is folded under RAG (a sub-component of the RAG
    // pipeline, mirroring the reranker), so it stacks immediately below the RAG node
    // and *above* MCP/LLM, not floating at the bottom of the data column.
    expect(positions.hybrid.x).toBe(positions.rag.x);
    expect(positions.hybrid.y).toBeGreaterThanOrEqual(positions.rag.y + heights.rag);
    expect(positions.hybrid.y).toBeLessThan(positions.mcp.y);
    expect(positions.hybrid.y).toBeLessThan(positions.llm.y);
    // the services tier box wraps it
    const box = tierBoxes.services;
    expect(positions.hybrid.y + heights.hybrid).toBeLessThanOrEqual(box.y + box.h);
  });

  it("places summarization under the agent, inside the agent tier", () => {
    const sel = selectionOf(["mcp", "summarization"]);
    const { positions, heights, tierBoxes } = computeLayout(new Set(), sel);
    expect(positions.summarization).toBeDefined();
    expect(positions.summarization.x).toBe(positions.agent.x);
    expect(positions.summarization.y).toBeGreaterThanOrEqual(positions.agent.y + heights.agent);
    const box = tierBoxes.agent;
    expect(positions.summarization.y + heights.summarization).toBeLessThanOrEqual(box.y + box.h);
  });

  it("summarization never overlaps the sub-agent row under the multiagent runtime", () => {
    const sel = selectionOf(["mcp", "summarization"], "multiagent");
    const { positions, heights } = computeLayout(new Set(), sel);
    const subagentBottom = Math.max(
      positions.researcher.y + heights.researcher,
      positions.coder.y + heights.coder,
      positions.critic.y + heights.critic,
    );
    expect(positions.summarization.y).toBeGreaterThanOrEqual(subagentBottom);
  });
});

describe("public frontier geometry (032-network-boundary AC1)", () => {
  for (const { name, sel } of SELECTIONS) {
    it(`sits between the client tier and the private boundary in ${name}`, () => {
      const layout = computeLayout(new Set(), sel);
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
