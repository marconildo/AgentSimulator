// 087-chunk-overlap-highlight — overlapPrefixLen is a pure projection of the chunk
// texts (already in the trace) into the length of the leading overlap a chunk carries
// from the previous one. Structural asserts.
import { describe, expect, it } from "vitest";

import { overlapPrefixLen } from "./chunkOverlap";

describe("overlapPrefixLen (AC1/AC2)", () => {
  it("returns the longest suffix of prev that is a prefix of cur", () => {
    // prev ends with "carried over" and cur starts with it → that whole tail is overlap.
    const prev = "first chunk text that is carried over";
    const cur = "carried over into the second chunk text";
    expect(overlapPrefixLen(prev, cur)).toBe("carried over".length);
  });

  it("returns 0 when there is no overlap", () => {
    expect(overlapPrefixLen("alpha beta", "gamma delta")).toBe(0);
  });

  it("returns 0 when prev is undefined or empty (first chunk)", () => {
    expect(overlapPrefixLen(undefined, "anything")).toBe(0);
    expect(overlapPrefixLen("", "anything")).toBe(0);
  });

  it("equals the overlap O for fixed windows sharing O boundary chars (AC2)", () => {
    const O = 12;
    const source = "0123456789abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ";
    const size = 24;
    const step = size - O;
    const prev = source.slice(0, size); // chars [0, 24)
    const cur = source.slice(step, step + size); // chars [12, 36) → shares [12, 24)
    expect(overlapPrefixLen(prev, cur)).toBe(O);
  });

  it("picks the LONGEST match, not the first short coincidence", () => {
    // a short common piece "ab" exists, but a longer real tail "the tail" is the overlap.
    const prev = "ab xyz the tail";
    const cur = "the tail continues";
    expect(overlapPrefixLen(prev, cur)).toBe("the tail".length);
  });
});
