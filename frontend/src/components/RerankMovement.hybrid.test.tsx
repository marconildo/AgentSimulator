/** @vitest-environment jsdom */
// 070-hybrid-search regression: when hybrid + rerank compose, the reranker scores the
// FUSED pool, which can include a BM25-only chunk whose cosine `similarity` is null.
// RerankMovementList must render it without `null.toFixed(...)` crashing the whole app.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RerankMovementList, type RerankMove } from "./InspectorPanel";
import { UI } from "../i18n/strings";

afterEach(cleanup);

describe("RerankMovementList with a null-similarity (BM25-only) candidate (070)", () => {
  it("renders without throwing", () => {
    const movement: RerankMove[] = [
      { prev_rank: 1, new_rank: 1, score: 0.91, similarity: 0.82, source: "rag.md" },
      // BM25-only fused chunk the dense lane never scored → similarity is null.
      { prev_rank: 2, new_rank: 2, score: 0.4, similarity: null, source: "embeddings.md" },
    ];
    const { container } = render(
      <RerankMovementList movement={movement} k={4} i={UI.en.inspector} threshold={0} />,
    );
    expect(container.textContent).toContain("embeddings.md");
    // The cosine label is shown for the dense chunk, omitted for the BM25-only one.
    expect(container.textContent).toContain("cos 0.82");
  });
});
