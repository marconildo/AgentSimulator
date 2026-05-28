// 045-composer-agent-selector — bilingual parity for the new agent-selector
// strings (composer chip + 044 dialog sidebar). Constitution §4: every new
// user-facing string ships en + pt.

import { describe, expect, it } from "vitest";

import { UI } from "./strings";

describe("agentSelector i18n (045-composer-agent-selector)", () => {
  const en = UI.en.chat.agentSelector;
  const pt = UI.pt.chat.agentSelector;

  it("has the same leaf keys in en and pt", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("has a non-empty string for every static label in both languages", () => {
    for (const k of ["label", "menuHeading", "locked", "lockedInlineNote"] as const) {
      expect(typeof en[k]).toBe("string");
      expect(en[k].trim()).toBeTruthy();
      expect(typeof pt[k]).toBe("string");
      expect(pt[k].trim()).toBeTruthy();
    }
  });

  it("interpolates the agent name in aria-label functions", () => {
    expect(en.ariaLabel("Lumi")).toMatch(/Lumi/);
    expect(pt.ariaLabel("Lumi")).toMatch(/Lumi/);
    expect(en.lockedAriaLabel("Lumi")).toMatch(/Lumi/);
    expect(pt.lockedAriaLabel("Lumi")).toMatch(/Lumi/);
  });
});
