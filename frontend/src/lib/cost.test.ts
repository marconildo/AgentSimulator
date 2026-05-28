// Compact figure formatting for token counts (used by the LLM readout, the HUD
// and the 036 context-window budget). Pins the k/M thresholds so the context
// window reads "1M" instead of "1048k".

import { describe, expect, it } from "vitest";

import { formatTokens } from "./cost";

describe("formatTokens", () => {
  it("leaves small counts as integers", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
  });

  it("uses k for thousands", () => {
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(12345)).toBe("12k");
    expect(formatTokens(128000)).toBe("128k"); // gpt-4o / 4o-mini window
  });

  it("uses M for millions, dropping a trailing .0", () => {
    expect(formatTokens(1_047_576)).toBe("1M"); // gpt-4.1* window (was "1048k")
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(2_000_000)).toBe("2M");
  });
});
