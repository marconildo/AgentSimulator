// 008-scenario-framework. The scenario is a GLOBAL app mode (like cloud/theme):
// one selection for the whole app, persisted to localStorage, defaulting to
// `simple`. Only `simple` executes today (`canSend`); the upper rungs are
// view-only previews. These tests pin the store + the send-gating predicate.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  visibleHopsFor,
  visibleStationIdsFor,
  visibleStationsFor,
  visibleTiersFor,
} from "./stations";

const STORAGE_KEY = "agentsim.scenario";

// The set of stations the app renders today (the `simple` rung must match this).
// 033-ingestion-node adds `ingestion` — a real station, visible in every scenario.
const TODAY_STATIONS = [
  "frontend",
  "backend",
  "agent",
  "database",
  "rag",
  "ingestion",
  "mcp",
  "llm",
];

async function freshStore(stored?: string) {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem(STORAGE_KEY, stored);
  vi.resetModules();
  return import("./scenario");
}

describe("scenario store (AC5)", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to simple when nothing is stored", async () => {
    const { useScenario } = await freshStore();
    expect(useScenario.getState().scenario).toBe("simple");
  });

  it("restores a persisted choice on reload", async () => {
    const { useScenario } = await freshStore("advanced");
    expect(useScenario.getState().scenario).toBe("advanced");
  });

  it("falls back to simple for junk in storage", async () => {
    const { useScenario } = await freshStore("quantum");
    expect(useScenario.getState().scenario).toBe("simple");
  });

  it("setScenario persists the choice (global, not per-conversation)", async () => {
    const { useScenario } = await freshStore();
    useScenario.getState().setScenario("intermediate");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("intermediate");
    expect(useScenario.getState().scenario).toBe("intermediate");
  });

  it("isScenario guards the union", async () => {
    const { isScenario } = await freshStore();
    expect(isScenario("simple")).toBe(true);
    expect(isScenario("intermediate")).toBe(true);
    expect(isScenario("advanced")).toBe(true);
    expect(isScenario("quantum")).toBe(false);
    expect(isScenario(null)).toBe(false);
  });
});

describe("canSend — send is gated to executable rungs (AC4)", () => {
  it("allows only the simple rung; the previews are view-only", async () => {
    const { canSend } = await freshStore();
    expect(canSend("simple")).toBe(true);
    expect(canSend("intermediate")).toBe(false);
    expect(canSend("advanced")).toBe(false);
  });
});

describe("scenario-scoped visual model (AC3, AC4)", () => {
  it("the simple rung renders exactly today's stations (AC3)", () => {
    expect(new Set(visibleStationIdsFor("simple"))).toEqual(new Set(TODAY_STATIONS));
  });

  it("the simple rung renders only hops between visible stations (AC3)", () => {
    const ids = new Set(visibleStationIdsFor("simple"));
    const hops = visibleHopsFor("en", "simple");
    expect(hops.length).toBeGreaterThan(0);
    for (const h of hops) {
      expect(ids.has(h.source)).toBe(true);
      expect(ids.has(h.target)).toBe(true);
    }
  });

  it("the ladder is cumulative: simple ⊂ intermediate ⊂ advanced (AC4)", () => {
    const simple = new Set(visibleStationIdsFor("simple"));
    const inter = new Set(visibleStationIdsFor("intermediate"));
    const adv = new Set(visibleStationIdsFor("advanced"));
    for (const id of simple) expect(inter.has(id)).toBe(true);
    for (const id of inter) expect(adv.has(id)).toBe(true);
    expect(inter.size).toBeGreaterThan(simple.size); // adds the reranker
    expect(adv.size).toBeGreaterThan(inter.size); // adds the AI-Ops tier
  });

  it("upper-rung stations are flagged comingSoon and never carry a live stage (AC4)", () => {
    const adv = visibleStationsFor("en", "advanced");
    const previews = adv.filter((s) => !TODAY_STATIONS.includes(s.id));
    expect(previews.length).toBeGreaterThan(0);
    for (const s of previews) {
      expect(s.comingSoon).toBe(true);
      // No TraceEvent stage maps to a non-executing preview node — §3.
      expect(s.stages).toEqual([]);
    }
    // The today-stations stay live (not coming soon).
    for (const s of adv.filter((x) => TODAY_STATIONS.includes(x.id))) {
      expect(s.comingSoon ?? false).toBe(false);
      expect(s.stages.length).toBeGreaterThan(0);
    }
  });
});

describe("bilingual + cloud map for every element (AC6)", () => {
  for (const lang of ["en", "pt"] as const) {
    it(`every station has non-empty ${lang} prose + a full cloud map`, () => {
      for (const s of visibleStationsFor(lang, "advanced")) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.subtitle.length).toBeGreaterThan(0);
        expect(s.blurb.length).toBeGreaterThan(0);
        expect(s.generic.length).toBeGreaterThan(0);
        expect(s.clouds.azure && s.clouds.aws && s.clouds.gcp).toBeTruthy();
      }
    });

    it(`every tier has non-empty ${lang} prose + a full cloud map`, () => {
      for (const tier of visibleTiersFor(lang, "advanced")) {
        expect(tier.title.length).toBeGreaterThan(0);
        expect(tier.alias.length).toBeGreaterThan(0);
        expect(tier.generic.length).toBeGreaterThan(0);
        expect(tier.clouds.azure && tier.clouds.aws && tier.clouds.gcp).toBeTruthy();
      }
    });
  }
});
