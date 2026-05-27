// 006-interactive-experiments — every new experiment-panel string must exist in
// both English and Portuguese (constitution §4). This pins en/pt parity for the
// `settings.experiment` block so an English-only label can never ship (AC6).

import { describe, expect, it } from "vitest";

import { PHASE_ORDER } from "../lib/phases";
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

describe("inspector i18n (007-numeric-transparency)", () => {
  const enI = UI.en.inspector;
  const ptI = UI.pt.inspector;

  it("has the same leaf keys in en and pt", () => {
    expect(leafKeys(enI).sort()).toEqual(leafKeys(ptI).sort());
  });

  it("includes the new numeric-transparency labels in both languages", () => {
    const keys = [
      "jsonrpc",
      "request",
      "response",
      "requestBody",
      "rank",
      "distance",
      "similarity",
      "reconstructed",
    ] as const;
    for (const k of keys) {
      expect(typeof enI[k]).toBe("string");
      expect((enI[k] as string).trim()).toBeTruthy();
      expect(typeof ptI[k]).toBe("string");
      expect((ptI[k] as string).trim()).toBeTruthy();
    }
  });

  it("includes the LLM assembled-prompt user + history labels (B3)", () => {
    // The LLM inspector now renders the USER message and conversation history
    // (already in prompt_preview) — both need their own inspector-block label.
    for (const k of ["userMessage", "history"] as const) {
      expect(typeof enI[k]).toBe("string");
      expect((enI[k] as string).trim()).toBeTruthy();
      expect(typeof ptI[k]).toBe("string");
      expect((ptI[k] as string).trim()).toBeTruthy();
    }
  });
});

describe("phase tooltip captions (§4.11)", () => {
  // The phase chips reuse the tour captions as their hover tooltip, so every
  // phase must carry a non-empty explanation in both languages (TypeScript pins
  // completeness; this pins that none is blank).
  it("has a non-empty hint for every phase in en and pt", () => {
    for (const phase of PHASE_ORDER) {
      expect(UI.en.tour.captions[phase]?.trim()).toBeTruthy();
      expect(UI.pt.tour.captions[phase]?.trim()).toBeTruthy();
    }
  });
});

describe("app banner i18n (B9)", () => {
  it("has a non-empty offline + no-key banner message in both languages", () => {
    for (const key of ["offline", "noKey"] as const) {
      expect(UI.en.app[key]?.trim()).toBeTruthy();
      expect(UI.pt.app[key]?.trim()).toBeTruthy();
    }
  });
});

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
