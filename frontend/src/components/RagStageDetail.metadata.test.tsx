/** @vitest-environment jsdom */
// 073-metadata-first-class (AC2/AC6) — retrieved chunks render their "why retrieved"
// metadata chips (section · type · position), and degrade gracefully when absent.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RagStageDetail } from "./RagStageDetail";
import { UI } from "../i18n/strings";
import type { RagStage } from "../lib/ragPipeline";

afterEach(cleanup);

const r = UI.en.ragDetail;

function retrievalStage(chunks: Record<string, unknown>[]): RagStage {
  return {
    id: "retrieval",
    status: "done",
    data: { metric: "cosine", k: 4, candidates: chunks.length, chunks },
  };
}

describe("RagStageDetail metadata chips (073)", () => {
  it("renders section/type/position chips for a metadata-rich chunk", () => {
    const stage = retrievalStage([
      {
        source: "embeddings.md",
        text: "cosine…",
        score: 0.7,
        similarity: 0.7,
        rank: 1,
        section: "Vector Search",
        doc_type: "markdown",
        position: "3/5",
      },
    ]);
    const { container } = render(<RagStageDetail stage={stage} />);
    expect(container.textContent).toContain(r.metaWhyRetrieved);
    expect(container.textContent).toContain("Vector Search");
    expect(container.textContent).toContain("markdown");
    expect(container.textContent).toContain("3/5");
  });

  it("degrades gracefully for a legacy chunk with no metadata", () => {
    const stage = retrievalStage([
      { source: "old.md", text: "legacy", score: 0.5, similarity: 0.5, rank: 1 },
    ]);
    const { container } = render(<RagStageDetail stage={stage} />);
    // Still renders the chunk, just no "why retrieved" row.
    expect(container.textContent).toContain("old.md");
    expect(container.textContent).not.toContain(r.metaWhyRetrieved);
  });
});
