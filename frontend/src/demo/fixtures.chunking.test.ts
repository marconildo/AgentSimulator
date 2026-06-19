// 072-chunking-strategies / 073-metadata-first-class — the GitHub Pages demo must replay
// REAL captured data (constitution §3): the chunk-preview snapshot carries every strategy
// so the Chunking playground works backend-less, and the re-captured rag traces carry the
// 073 metadata so the "why retrieved" chips render in the demo.
import { describe, expect, it } from "vitest";

import { DEMO_CHUNK_PREVIEW, DEMO_TRACES } from "./fixtures";

describe("demo chunk-preview fixture (072)", () => {
  it("carries all four chunking strategies with chunks", () => {
    const strategies = new Set(DEMO_CHUNK_PREVIEW.previews.map((p) => p.strategy));
    expect(strategies).toEqual(new Set(["fixed", "recursive", "semantic", "agentic"]));
    // fixed vs recursive must differ (the playground's whole point).
    const by = Object.fromEntries(DEMO_CHUNK_PREVIEW.previews.map((p) => [p.strategy, p]));
    expect(by.fixed.chunks.map((c) => c.text)).not.toEqual(
      by.recursive.chunks.map((c) => c.text),
    );
  });
});

describe("demo deepagents + hybrid fixtures (070 × deepagents)", () => {
  it("registers deepagents-hybrid scenarios so Hybrid actually fuses under DeepAgents", () => {
    const scenarios = new Set(DEMO_TRACES.map((t) => t.scenario));
    expect(scenarios.has("deepagents-hybrid")).toBe(true);
    expect(scenarios.has("deepagents-hybrid-rerank")).toBe(true);
  });

  it("the rag deepagents-hybrid fixture carries a real rag.hybrid stage", () => {
    const f = DEMO_TRACES.find(
      (t) => t.qid === "rag" && t.scenario === "deepagents-hybrid" && t.lang === "en",
    );
    expect(f).toBeDefined();
    const stages = new Set(f!.fixture.events.map((e) => e.stage));
    expect(stages.has("rag.hybrid")).toBe(true);
  });
});

describe("demo rag fixtures carry 073 metadata", () => {
  it("the rag.simple retrieve chunks expose section/doc_type/position", () => {
    const rag = DEMO_TRACES.find((t) => t.qid === "rag" && t.scenario === "simple" && t.lang === "en");
    expect(rag).toBeDefined();
    const retrieve = rag!.fixture.events.find((e) => e.stage === "rag.retrieve" && e.phase === "end");
    const chunk = (retrieve!.data.chunks as Record<string, unknown>[])[0];
    expect(chunk.section).toBeTruthy();
    expect(chunk.doc_type).toBe("markdown");
    expect(chunk.position).toBeTruthy();
  });
});
