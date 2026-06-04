// 053-agent-harness — name the agent *runtime* (not the deployment tier) as an
// "Agent Harness". These tests pin: AC1 the AgentDetail framing line (en+pt),
// AC2 the glossary term (en+pt), AC4 the deployment tier label is UNCHANGED.

import { describe, expect, it } from "vitest";

import { stationByIdFor, tierByIdFor } from "../lib/stations";
import { UI } from "./strings";

const TERM = "Agent Harness";

describe("agent harness — AgentDetail framing (AC1)", () => {
  it("agentDetail.harness is non-empty in en and pt and names the term", () => {
    for (const lang of ["en", "pt"] as const) {
      const line = UI[lang].agentDetail.harness;
      expect(typeof line).toBe("string");
      expect(line.trim()).toBeTruthy();
      expect(line).toContain(TERM); // jargon proper noun stays English in both langs
    }
  });
});

describe("agent context window — anatomy-screen title (user rename)", () => {
  it("agentDetail.title is 'Agent Context Window' in en and pt", () => {
    for (const lang of ["en", "pt"] as const) {
      expect(UI[lang].agentDetail.title).toBe("Agent Context Window");
    }
  });
});

describe("agent harness — glossary term (AC2)", () => {
  it("glossary['Agent Harness'] exists and is non-empty in en and pt", () => {
    for (const lang of ["en", "pt"] as const) {
      const def = UI[lang].glossary[TERM];
      expect(typeof def, `missing glossary[${TERM}] in ${lang}`).toBe("string");
      expect(def.trim()).toBeTruthy();
    }
  });
});

describe("agent harness — visible on the agent station card (AC1)", () => {
  it("the agent station subtitle names the harness in en and pt", () => {
    for (const lang of ["en", "pt"] as const) {
      const sub = stationByIdFor(lang).agent.subtitle;
      expect(sub).toContain(TERM); // canvas-visible without opening the drill-in
    }
  });
});

describe("agent harness — deployment tier UNCHANGED (AC4)", () => {
  it("the agent tier keeps its n-tier label, not renamed to harness", () => {
    const en = tierByIdFor("en").agent;
    const pt = tierByIdFor("pt").agent;
    expect(en.title).toBe("Agent Tier");
    expect(en.alias).toBe("Compute (private)");
    expect(pt.title).toBe("Camada do Agente");
    expect(pt.alias).toBe("Compute (privado)");
  });
});
