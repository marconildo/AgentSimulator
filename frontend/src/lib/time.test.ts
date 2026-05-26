import { describe, expect, it } from "vitest";

import { formatClock, formatRelative, toMs } from "./time";

describe("toMs", () => {
  it("promotes seconds-since-epoch to milliseconds", () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("leaves a millisecond timestamp untouched", () => {
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });
});

describe("formatClock", () => {
  it("renders hours and minutes from a seconds timestamp", () => {
    // Assert the shape (HH:MM), not exact digits — the host timezone shifts them.
    const out = formatClock(Date.UTC(2024, 0, 1, 13, 37) / 1000, "en");
    expect(out).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe("formatRelative", () => {
  const now = Date.UTC(2024, 0, 10, 12, 0, 0);

  it("describes a few minutes ago in English", () => {
    const out = formatRelative((now - 5 * 60_000) / 1000, "en", now);
    expect(out).toMatch(/min/);
    expect(out).toMatch(/ago/);
  });

  it("describes several days ago in Portuguese", () => {
    const out = formatRelative((now - 3 * 86_400_000) / 1000, "pt", now);
    expect(out).toMatch(/há/i);
    expect(out).toMatch(/dia/i);
  });
});
