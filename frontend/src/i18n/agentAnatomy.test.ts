// 042-agent-anatomy — AC20 — every UI string ships in both en and pt.

import { describe, expect, it } from "vitest";

import { UI } from "./strings";

function flatten(obj: unknown, prefix = ""): Array<[string, unknown]> {
  if (obj === null || typeof obj !== "object") return [[prefix, obj]];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("agentAnatomy i18n parity (AC20)", () => {
  const en = flatten(UI.en.agentAnatomy);
  const pt = flatten(UI.pt.agentAnatomy);

  it("has the same key set across languages", () => {
    const enKeys = en.map(([k]) => k).sort();
    const ptKeys = pt.map(([k]) => k).sort();
    expect(enKeys).toEqual(ptKeys);
  });

  it("every value is non-empty (strings) or callable (functions)", () => {
    for (const [key, value] of [...en, ...pt]) {
      if (typeof value === "function") {
        // Smoke-call with sample args so we exercise the template too.
        const out = (value as (...args: number[]) => string)(1, 2);
        expect(typeof out, `${key} did not return a string`).toBe("string");
        expect(out.trim(), `${key} returned empty`).not.toBe("");
      } else {
        expect(typeof value, `${key} is not a string`).toBe("string");
        expect(String(value).trim(), `${key} is empty`).not.toBe("");
      }
    }
  });
});
