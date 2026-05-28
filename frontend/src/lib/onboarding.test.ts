// 037-first-visit-onboarding — the first-visit flag (localStorage) that drives
// the one-shot auto-tour and the canvas-first (collapsed Inspector) opening
// frame. Pure helpers, mirroring lib/scenario.ts. No timers, no rendering.

import { beforeEach, describe, expect, it } from "vitest";

import {
  initialInspectorCollapsed,
  isFirstVisit,
  markOnboarded,
  ONBOARDED_KEY,
  shouldAutoOnboard,
} from "./onboarding";

describe("first-visit onboarding flag (037)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("AC1: isFirstVisit is true on a clean browser, false after markOnboarded", () => {
    expect(isFirstVisit()).toBe(true);
    markOnboarded();
    expect(isFirstVisit()).toBe(false);
  });

  it("AC1: markOnboarded persists the flag (survives a reload)", () => {
    markOnboarded();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBeTruthy();
    // A fresh read (simulating a reload) still sees the flag.
    expect(isFirstVisit()).toBe(false);
  });

  it("AC2: shouldAutoOnboard fires only on the first visit", () => {
    expect(shouldAutoOnboard()).toBe(true);
    markOnboarded();
    expect(shouldAutoOnboard()).toBe(false);
  });

  it("AC3: initialInspectorCollapsed is true only on the first visit", () => {
    expect(initialInspectorCollapsed()).toBe(true);
    markOnboarded();
    expect(initialInspectorCollapsed()).toBe(false);
  });
});
