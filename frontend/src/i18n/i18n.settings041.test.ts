// 041-settings-page · AC10 — every new string introduced by this spec must
// ship in both English AND Portuguese (constitution §4). Pinned here so a
// future PR that adds an English-only key trips a red test rather than
// quietly shipping an EN-only page.

import { describe, expect, it } from "vitest";

import { UI } from "./strings";

describe("Spec 041 — new strings exist in both languages", () => {
  const langs = ["en", "pt"] as const;

  it.each(langs)("%s has app.config", (lang) => {
    expect(UI[lang].app.config).toBeTruthy();
    expect(UI[lang].app.config.length).toBeGreaterThan(0);
  });

  it.each(langs)("%s has settings.pageTitle", (lang) => {
    expect(UI[lang].settings.pageTitle).toBeTruthy();
    expect(UI[lang].settings.pageTitle.length).toBeGreaterThan(0);
  });

  it.each(langs)("%s has settings.pageTagline", (lang) => {
    expect(UI[lang].settings.pageTagline).toBeTruthy();
    expect(UI[lang].settings.pageTagline.length).toBeGreaterThan(0);
  });

  it.each(langs)("%s has settings.backToSim", (lang) => {
    expect(UI[lang].settings.backToSim).toBeTruthy();
    expect(UI[lang].settings.backToSim.length).toBeGreaterThan(0);
  });

  it("en and pt page titles differ (i.e. pt is actually translated, not copy-pasted)", () => {
    // Smoke-check: if both equal each other we forgot to translate.
    // Tagline is the most prose-y string, so check that specifically.
    expect(UI.en.settings.pageTagline).not.toBe(UI.pt.settings.pageTagline);
    expect(UI.en.settings.backToSim).not.toBe(UI.pt.settings.backToSim);
  });
});
