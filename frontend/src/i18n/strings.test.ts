// 006-interactive-experiments — every new experiment-panel string must exist in
// both English and Portuguese (constitution §4). This pins en/pt parity for the
// `settings.experiment` block so an English-only label can never ship (AC6).

import { describe, expect, it } from "vitest";

import { UI } from "./strings";

const en = UI.en.settings.experiment;
const pt = UI.pt.settings.experiment;

function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? leafKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("settings.experiment i18n", () => {
  it("has the same keys in en and pt", () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(pt).sort());
  });

  it("has a label for every MCP tool in both languages", () => {
    const tools = ["calculator", "current_time", "kb_lookup"];
    for (const name of tools) {
      expect(en.toolLabels[name]?.trim()).toBeTruthy();
      expect(pt.toolLabels[name]?.trim()).toBeTruthy();
    }
  });

  it("has no empty strings", () => {
    for (const dict of [en, pt]) {
      const values = leafKeys(dict).map((path) =>
        path.split(".").reduce<unknown>((o, key) => (o as Record<string, unknown>)[key], dict),
      );
      for (const v of values) expect(String(v).trim().length).toBeGreaterThan(0);
    }
  });
});
