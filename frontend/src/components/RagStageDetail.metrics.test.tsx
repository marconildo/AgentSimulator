/** @vitest-environment jsdom */
// 071-retrieval-metrics (AC7) — the Retrieval card's Quality block renders the scorecard
// when `eval` is present, and an honest "no ground truth" line when it is absent.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RagStageDetail } from "./RagStageDetail";
import type { RagStage } from "../lib/ragPipeline";

afterEach(cleanup);

function retrievalStage(data: Record<string, unknown>): RagStage {
  return {
    id: "retrieval",
    status: "done",
    data: {
      metric: "cosine",
      k: 4,
      candidates: 4,
      chunks: [
        { source: "embeddings.md", text: "cosine…", score: 0.7, similarity: 0.7, rank: 1 },
        { source: "rag.md", text: "chunking…", score: 0.4, similarity: 0.4, rank: 2 },
      ],
      ...data,
    },
  };
}

describe("RagStageDetail retrieval Quality block (071)", () => {
  it("renders Precision/Recall/MRR + missed when eval is present", () => {
    const stage = retrievalStage({
      eval: {
        precision_at_k: 0.5,
        recall_at_k: 1.0,
        mrr: 1.0,
        k: 4,
        relevant_count: 1,
        relevant_sources: ["embeddings.md"],
        missed: ["agents.md"],
        id: "cosine",
      },
    });
    const { container } = render(<RagStageDetail stage={stage} />);
    // Headline numbers (formatted to 2dp) appear.
    expect(container.textContent).toContain("0.50");
    expect(container.textContent).toContain("1.00");
    // The relevant chunk is ticked, the irrelevant one crossed.
    expect(container.textContent).toContain("✓");
    expect(container.textContent).toContain("✗");
    // Missed relevant source is listed.
    expect(container.textContent).toContain("agents.md");
  });

  it("renders the honest no-ground-truth line when eval is absent", () => {
    const { container } = render(<RagStageDetail stage={retrievalStage({})} />);
    expect(container.textContent?.toLowerCase()).toContain("ground truth");
    // No ✓/✗ relevance marks without a benchmark.
    expect(container.textContent).not.toContain("✓");
  });
});
