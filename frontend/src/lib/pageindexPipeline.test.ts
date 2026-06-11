// 056-ragless-pageindex — the pure projection behind the RAGLESS drill-in panel.
// Pins that the reasoning-retrieval pipeline (tree → navigate → select → augmented)
// reports each stage's live status from the event log + cursor, so live and replay
// share one code path.

import { describe, expect, it } from "vitest";

import {
  derivePageIndexPipeline,
  PAGEINDEX_STAGE_ORDER,
  type PageIndexStageId,
} from "./pageindexPipeline";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function fullRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("pageindex.tree", "start"),
    ev("pageindex.tree", "end", { nodes: 18, files: 6, leaves: 12, tree: { id: "root" } }),
    ev("pageindex.navigate", "start"),
    ev("pageindex.navigate", "end", {
      model: "gpt",
      query: "chunking?",
      reasoning: "the RAG section covers chunking",
      selected: ["rag.md-p1"],
    }),
    ev("pageindex.select", "start"),
    ev("pageindex.select", "end", {
      count: 1,
      reasoning: "the RAG section covers chunking",
      chunks: [{ source: "rag.md", text: "Chunking matters…", node_id: "rag.md-p1", rank: 1 }],
    }),
    ev("llm.prompt", "end", {
      context: "[rag.md] Chunking matters…",
      context_window: 8000,
      context_budget: { retrieved: 42 },
    }),
  ];
}

const statusOf = (events: TraceEvent[], cursor: number, id: PageIndexStageId) =>
  derivePageIndexPipeline(events, cursor).stages.find((s) => s.id === id)!.status;

describe("derivePageIndexPipeline", () => {
  it("orders stages tree → navigate → select → augmented", () => {
    const p = derivePageIndexPipeline(fullRun(), fullRun().length - 1);
    expect(p.stages.map((s) => s.id)).toEqual(PAGEINDEX_STAGE_ORDER);
  });

  it("is not started with an empty log", () => {
    expect(derivePageIndexPipeline([], -1).started).toBe(false);
  });

  it("marks a stage active while mid-flight and done once its END passes", () => {
    const e = fullRun();
    // cursor on the tree START (index 0): tree active, the rest pending.
    expect(statusOf(e, 0, "tree")).toBe("active");
    expect(statusOf(e, 0, "navigate")).toBe("pending");
    // cursor on the tree END (index 1): tree done, navigate still pending.
    expect(statusOf(e, 1, "tree")).toBe("done");
    expect(statusOf(e, 1, "navigate")).toBe("pending");
    // cursor on navigate START (index 2): navigate active.
    expect(statusOf(e, 2, "navigate")).toBe("active");
  });

  it("surfaces the navigation reasoning and selected sections", () => {
    const e = fullRun();
    const p = derivePageIndexPipeline(e, e.length - 1);
    const nav = p.stages.find((s) => s.id === "navigate")!;
    expect(nav.data.reasoning).toBe("the RAG section covers chunking");
    expect(nav.data.selected).toEqual(["rag.md-p1"]);
    const sel = p.stages.find((s) => s.id === "select")!;
    expect((sel.data.chunks as unknown[]).length).toBe(1);
    expect(sel.data.count).toBe(1);
  });

  it("resolves the navigated nodes against the tree so Navigate shows the path", () => {
    // The tree (from the tree stage) is reachable in the navigate stage, and the
    // selected ids resolve to concrete nodes (id + title + source) for the drill-in.
    const e = [
      ev("pageindex.tree", "end", {
        nodes: 3,
        leaves: 2,
        tree: {
          id: "root",
          children: [
            { id: "rag.md-h0", title: "RAG", source: "rag.md", children: [
              { id: "rag.md-p1", title: "Chunking matters", source: "rag.md" },
            ] },
          ],
        },
      }),
      ev("pageindex.navigate", "end", { selected: ["rag.md-p1"], reasoning: "r" }),
    ];
    const nav = derivePageIndexPipeline(e, e.length - 1).stages.find((s) => s.id === "navigate")!;
    const nodes = nav.data.navigatedNodes as Array<{ id: string; title: string }>;
    expect(nodes).toEqual([{ id: "rag.md-p1", title: "Chunking matters", source: "rag.md" }]);
    expect(nav.data.tree).toBeTruthy();
  });

  it("reads the tree size and the augmented (retrieved) token slice", () => {
    const e = fullRun();
    const p = derivePageIndexPipeline(e, e.length - 1);
    expect(p.stages.find((s) => s.id === "tree")!.data.nodes).toBe(18);
    const aug = p.stages.find((s) => s.id === "augmented")!;
    expect(aug.data.retrievedTokens).toBe(42);
    expect(aug.status).toBe("done");
  });

  it("is started once any pageindex stage appears", () => {
    const e = fullRun();
    expect(derivePageIndexPipeline(e, 0).started).toBe(true);
  });
});
