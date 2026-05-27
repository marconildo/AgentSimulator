import { describe, expect, it } from "vitest";

import { formatClock, formatLatency, formatRelative, toMs } from "./time";

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

describe("formatLatency", () => {
  it("floors sub-millisecond durations to '<1 ms' instead of a misleading '0 ms'", () => {
    // The backend rounds latency to one decimal, so a fast stage arrives as 0.0
    // or 0.4 — both would render as "0 ms" with a naive toFixed(0).
    expect(formatLatency(0)).toBe("<1 ms");
    expect(formatLatency(0.4)).toBe("<1 ms");
    expect(formatLatency(0.9)).toBe("<1 ms");
  });

  it("rounds to whole milliseconds at and above 1 ms", () => {
    expect(formatLatency(1)).toBe("1 ms");
    expect(formatLatency(12.4)).toBe("12 ms");
    expect(formatLatency(12.6)).toBe("13 ms");
    expect(formatLatency(3321)).toBe("3321 ms");
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
