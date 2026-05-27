// 018-cumulative-hud (T5) — the pre-send estimate. A real tokenizer (js-tiktoken,
// o200k_base) is loaded lazily and encodes the composed input to an approximate
// token count, so the HUD can honestly label it `tiktoken · o200k_base` (the
// lesson: counts are model-specific). The cost is a labeled approximation from
// the 011 input rate. Both are explicitly estimates, not billed figures.

import { describe, expect, it } from "vitest";

import { estimateInputCostUsd, estimateTokens, TOKENIZER_LABEL } from "./tokenize";

describe("estimateTokens (018 AC3 — lazy real tokenizer)", () => {
  it("returns 0 for empty / whitespace input", async () => {
    expect(await estimateTokens("")).toBe(0);
    expect(await estimateTokens("   ")).toBe(0);
  });

  it("returns a plausible positive count for real text", async () => {
    const n = await estimateTokens("hello world");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10); // a couple of tokens, not characters
  });

  it("grows with the input length", async () => {
    const short = await estimateTokens("hello world");
    const long = await estimateTokens("hello world ".repeat(50));
    expect(long).toBeGreaterThan(short);
  });

  it("names the tokenizer it used (model-specific counts)", () => {
    expect(TOKENIZER_LABEL).toContain("o200k_base");
  });
});

describe("estimateInputCostUsd (018 — labeled approximation)", () => {
  it("prices prompt tokens at the default model's input rate", () => {
    // gpt-4o-mini input list price: $0.15 / 1M tokens (mirrors backend pricing).
    expect(estimateInputCostUsd(1_000_000, "gpt-4o-mini")).toBeCloseTo(0.15, 8);
    expect(estimateInputCostUsd(0, "gpt-4o-mini")).toBe(0);
  });

  it("is 0 for an unknown or null model rather than guessing", () => {
    expect(estimateInputCostUsd(1_000_000, "some-unlisted-model")).toBe(0);
    expect(estimateInputCostUsd(1_000_000, null)).toBe(0);
  });
});
