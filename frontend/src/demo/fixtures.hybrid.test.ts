// 070-hybrid-search — the GitHub Pages demo must replay a REAL hybrid run (constitution
// §3): the captured fixtures exist and actually carry the rag.hybrid fusion stage, so a
// demo visitor who enables Hybrid Search sees the fusion, not a non-hybrid fallback.
import { describe, expect, it } from "vitest";

import { DEMO_TRACES } from "./fixtures";

describe("demo hybrid fixtures (070)", () => {
  it("registers the hybrid and hybrid-rerank scenarios for a retrieving question", () => {
    const scenarios = new Set(DEMO_TRACES.map((t) => t.scenario));
    expect(scenarios.has("hybrid")).toBe(true);
    expect(scenarios.has("hybrid-rerank")).toBe(true);
  });

  it("the rag question's hybrid fixture carries a real rag.hybrid stage", () => {
    const ragHybrid = DEMO_TRACES.find(
      (t) => t.qid === "rag" && t.scenario === "hybrid" && t.lang === "en",
    );
    expect(ragHybrid).toBeDefined();
    const stages = new Set(ragHybrid!.fixture.events.map((e) => e.stage));
    expect(stages.has("rag.hybrid")).toBe(true);
    // The fusion END carries the per-candidate movement the drill-in renders.
    const end = ragHybrid!.fixture.events.find(
      (e) => e.stage === "rag.hybrid" && e.phase === "end",
    );
    expect(Array.isArray(end?.data.candidates)).toBe(true);
  });

  it("the compose fixture carries BOTH rag.hybrid and rag.rerank", () => {
    const composeEn = DEMO_TRACES.find(
      (t) => t.qid === "rag" && t.scenario === "hybrid-rerank" && t.lang === "en",
    );
    const stages = new Set(composeEn!.fixture.events.map((e) => e.stage));
    expect(stages.has("rag.hybrid")).toBe(true);
    expect(stages.has("rag.rerank")).toBe(true);
  });
});
