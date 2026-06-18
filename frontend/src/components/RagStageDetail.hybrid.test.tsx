/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RagStageDetail } from "./RagStageDetail";
import type { RagStage } from "../lib/ragPipeline";

afterEach(cleanup);

describe("RagStageDetail hybrid (070) renders without throwing", () => {
  it("renders the fusion table with real movement", () => {
    const stage: RagStage = {
      id: "hybrid",
      status: "done",
      data: {
        rrf_k: 60,
        bm25_k: 10,
        vectorCandidates: 10,
        bm25Candidates: 8,
        fused: 12,
        movement: [
          { source: "embeddings.md", vector_rank: 5, bm25_rank: 1, rrf_score: 0.0318, new_rank: 1 },
          { source: "rag.md", vector_rank: 1, bm25_rank: null, rrf_score: 0.0164, new_rank: 2 },
        ],
      },
    };
    const { container } = render(<RagStageDetail stage={stage} />);
    expect(container.textContent).toContain("embeddings.md");
  });

  it("renders the inactive state", () => {
    const stage: RagStage = { id: "hybrid", status: "inactive", data: {} };
    const { container } = render(<RagStageDetail stage={stage} />);
    expect(container.textContent).toBeTruthy();
  });
});
