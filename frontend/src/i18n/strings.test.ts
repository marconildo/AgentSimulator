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

describe("clear-databases i18n (025-clear-databases)", () => {
  // AC6 — the new "Data" / "Clear databases" chrome must ship en + pt with the
  // same leaf keys and no blank value, so an English-only label can never ship.
  const enD = UI.en.settings.data;
  const ptD = UI.pt.settings.data;

  it("has the same leaf keys in en and pt", () => {
    expect(leafKeys(enD).sort()).toEqual(leafKeys(ptD).sort());
  });

  it("has a non-empty value for every key in both languages", () => {
    for (const k of leafKeys(enD)) {
      expect((enD as Record<string, string>)[k]?.trim()).toBeTruthy();
      expect((ptD as Record<string, string>)[k]?.trim()).toBeTruthy();
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

describe("learn chrome i18n (023-learn-content-enrichment)", () => {
  it("has the new Learn block labels in both languages", () => {
    for (const k of ["howItWorks", "otherOptions", "studyLinks"] as const) {
      expect(UI.en.learn[k]?.trim()).toBeTruthy();
      expect(UI.pt.learn[k]?.trim()).toBeTruthy();
    }
  });

  it("has the cloud-block title builder in both languages", () => {
    expect(UI.en.learn.onCloud("Azure").trim()).toBeTruthy();
    expect(UI.en.learn.onCloud("Azure")).toContain("Azure");
    expect(UI.pt.learn.onCloud("Azure").trim()).toBeTruthy();
    expect(UI.pt.learn.onCloud("Azure")).toContain("Azure");
  });

  // 024-learn-cloud-column — the "Build on {cloud}" column header hint (AC6)
  it("has the cloud-guide hint builder in both languages", () => {
    expect(UI.en.learn.cloudGuideHint("Azure").trim()).toBeTruthy();
    expect(UI.en.learn.cloudGuideHint("Azure")).toContain("Azure");
    expect(UI.pt.learn.cloudGuideHint("Azure").trim()).toBeTruthy();
    expect(UI.pt.learn.cloudGuideHint("Azure")).toContain("Azure");
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

describe("message-trace-link i18n (022-message-trace-link)", () => {
  it("has the click-to-load / loaded / expired strings in en and pt", () => {
    for (const k of ["clickToLoad", "loaded", "expired"] as const) {
      expect(UI.en.trace[k]?.trim()).toBeTruthy();
      expect(UI.pt.trace[k]?.trim()).toBeTruthy();
    }
  });
});

describe("cumulative-hud i18n (018-cumulative-hud)", () => {
  it("has every HUD + estimate label in en and pt", () => {
    for (const k of [
      "turns",
      "tokens",
      "cost",
      "toolCalls",
      "ragHits",
      "partial",
      "estimate",
      "tokenizer",
    ] as const) {
      expect(UI.en.hud[k]?.trim()).toBeTruthy();
      expect(UI.pt.hud[k]?.trim()).toBeTruthy();
    }
  });
});

describe("chat cancel i18n (016-cancel-stream)", () => {
  it("has a non-empty cancel control + cancelled-status label in en and pt", () => {
    for (const key of ["cancel", "cancelled"] as const) {
      expect(UI.en.chat[key]?.trim()).toBeTruthy();
      expect(UI.pt.chat[key]?.trim()).toBeTruthy();
    }
  });
});

describe("failure-injection i18n (017-failure-injection)", () => {
  it("has the selector label + hint in both languages", () => {
    for (const k of ["label", "hint"] as const) {
      expect(en.failure[k]?.trim()).toBeTruthy();
      expect(pt.failure[k]?.trim()).toBeTruthy();
    }
  });

  it("has a label for every failure mode in both languages", () => {
    for (const mode of ["none", "tool_error", "llm_timeout"]) {
      expect(en.failure.modes[mode]?.trim()).toBeTruthy();
      expect(pt.failure.modes[mode]?.trim()).toBeTruthy();
    }
  });

  it("has the simulated-failure readout badge in both languages", () => {
    expect(UI.en.readout.simulatedError.trim()).toBeTruthy();
    expect(UI.pt.readout.simulatedError.trim()).toBeTruthy();
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
