import { describe, expect, it } from "vitest";

import { healthBanner } from "./health";

describe("healthBanner (B9)", () => {
  it("shows nothing while loading or when a keyed backend is healthy", () => {
    expect(healthBanner("loading", null)).toBeNull();
    expect(healthBanner("ok", true)).toBeNull();
    // Backend up but the key state is unknown — don't cry wolf.
    expect(healthBanner("ok", null)).toBeNull();
  });

  it("flags an unreachable backend as offline (regardless of key)", () => {
    expect(healthBanner("down", null)).toBe("offline");
    expect(healthBanner("down", true)).toBe("offline");
  });

  it("flags a healthy backend that reports no key — it can't run a turn", () => {
    expect(healthBanner("ok", false)).toBe("no-key");
  });
});
