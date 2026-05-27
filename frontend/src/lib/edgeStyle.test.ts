// 032-network-boundary (AC3) — the return-leg style decision extracted from
// FlowEdge. An active *reverse* leg (an internal respond hop) and the SSE stream
// read as a return (dashed, stream color), distinct from an outbound request.

import { describe, expect, it } from "vitest";

import { returnStyleFor } from "./edgeStyle";

const ACCENT = "var(--color-pink)";

describe("returnStyleFor (032-network-boundary AC3)", () => {
  it("the SSE stream reads as a dashed return", () => {
    const s = returnStyleFor(false, false, true, ACCENT);
    expect(s.isReturn).toBe(true);
    expect(s.dashed).toBe(true);
  });

  it("an active reverse leg reads as a return, distinct from an outbound request", () => {
    const ret = returnStyleFor(true, true, false, ACCENT);
    const out = returnStyleFor(true, false, false, ACCENT);
    expect(ret.isReturn).toBe(true);
    expect(ret.dashed).toBe(true);
    expect(out.isReturn).toBe(false);
    expect(out.dashed).toBe(false);
    expect(ret.color).not.toBe(out.color); // a return is visually distinct
    expect(out.color).toBe(ACCENT); // outbound uses the target accent
  });

  it("a quiet edge is neither a return nor dashed", () => {
    const s = returnStyleFor(false, false, false, ACCENT);
    expect(s.isReturn).toBe(false);
    expect(s.dashed).toBe(false);
  });
});
