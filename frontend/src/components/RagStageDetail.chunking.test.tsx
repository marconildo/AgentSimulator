/** @vitest-environment jsdom */
// 072-chunking-strategies (AC7) — the Chunking playground's comparison view renders the
// chosen strategy beside fixed-size, flagging fixed's mid-sentence cuts. Pure render from
// a chunk-preview payload (no fetch).
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChunkCompare } from "./RagStageDetail";
import { UI } from "../i18n/strings";
import type { ChunkPreviewItem } from "../lib/chatApi";

afterEach(cleanup);

const r = UI.en.ragDetail;

function item(strategy: string, texts: string[]): ChunkPreviewItem {
  let cursor = 0;
  return {
    strategy,
    count: texts.length,
    chunks: texts.map((t) => {
      const start = cursor;
      cursor += t.length;
      return { text: t, start, end: cursor, chars: t.length };
    }),
  };
}

describe("ChunkCompare (072)", () => {
  it("renders the chosen strategy beside fixed, flagging mid-sentence cuts", () => {
    const recursive = item("recursive", ["A whole sentence stays intact."]);
    // The fixed chunk ends without sentence punctuation → must be flagged.
    const fixed = item("fixed", ["A whole sentence is cut in ha"]);
    const { container } = render(
      <ChunkCompare chosen={recursive} chosenStrategy="recursive" fixed={fixed} r={r} />,
    );
    expect(container.textContent).toContain("Recursive");
    expect(container.textContent).toContain(r.chunkCompareWithFixed);
    // The mid-sentence flag appears for the fixed column.
    expect(container.textContent).toContain(r.chunkMidSentence);
  });

  it("does not flag a fixed chunk that ends on sentence punctuation", () => {
    const recursive = item("recursive", ["Clean."]);
    const fixed = item("fixed", ["Also clean."]);
    const { container } = render(
      <ChunkCompare chosen={recursive} chosenStrategy="recursive" fixed={fixed} r={r} />,
    );
    expect(container.textContent).not.toContain(r.chunkMidSentence);
  });

  it("shows an error marker for a keyed strategy that failed", () => {
    const semantic: ChunkPreviewItem = {
      strategy: "semantic",
      count: 0,
      chunks: [],
      error: "no key",
    };
    const fixed = item("fixed", ["x."]);
    const { container } = render(
      <ChunkCompare chosen={semantic} chosenStrategy="semantic" fixed={fixed} r={r} />,
    );
    expect(container.textContent).toContain("no key");
  });
});
