// 021-abstain-badge — `abstained(data)` is the pure, structural predicate the
// Agent anatomy uses to badge a tool call whose result was empty/not-found. It
// reads the backend's `found` signal on the open `mcp.call` data record (no
// string matching on the client) — `found === false` means the agent could
// honestly abstain on that sub-query (AC1).

import { describe, expect, it } from "vitest";

import { abstained } from "./abstain";

describe("abstained (021-abstain-badge)", () => {
  it("is true when the tool reported nothing found (AC1)", () => {
    expect(abstained({ found: false })).toBe(true);
  });

  it("is false for a substantive result (AC1)", () => {
    expect(abstained({ found: true })).toBe(false);
  });

  it("is false when no signal is present — absence is not abstention", () => {
    // Honest by construction: only an explicit `found:false` badges. A trace
    // from before the signal existed (or a non-tool event) must NOT badge.
    expect(abstained({})).toBe(false);
    expect(abstained({ found: undefined })).toBe(false);
  });
});
