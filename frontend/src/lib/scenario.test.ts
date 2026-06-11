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

// The always-visible base stations (the `simple` rung renders exactly these by
// default). 035-conditional-upload-nodes: `storage` + `ingestion` are real but
// rendered only during an upload, so they're a separate bucket — not in the base
// set and not `comingSoon` previews either.
const BASE_STATIONS = [
  "frontend",
  "backend",
  "agent",
  "database",
  "rag",
  "mcp",
  "llm",
];
const UPLOAD_STATIONS = ["storage", "ingestion"];

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
  it("allows the simple + intermediate rungs; advanced is still view-only", async () => {
    // 054-rag-block-expansion lit up the first real Intermediate node (the local
    // reranker), so Intermediate now executes; only Advanced stays a preview.
    const { canSend } = await freshStore();
    expect(canSend("simple")).toBe(true);
    expect(canSend("intermediate")).toBe(true);
    expect(canSend("advanced")).toBe(false);
  });
});

describe("scenario-scoped visual model (AC3, AC4)", () => {
  it("the simple rung renders exactly the base stations by default (AC3, 035 AC1)", () => {
    expect(new Set(visibleStationIdsFor("simple"))).toEqual(new Set(BASE_STATIONS));
  });

  it("reveals the upload nodes only when an upload is in scope (035 AC2)", () => {
    expect(new Set(visibleStationIdsFor("simple", true))).toEqual(
      new Set([...BASE_STATIONS, ...UPLOAD_STATIONS]),
    );
  });

  it("the simple rung renders only hops between visible stations (AC3)", () => {
    // Both states: hops must only reference currently-visible stations.
    for (const showUpload of [false, true]) {
      const ids = new Set(visibleStationIdsFor("simple", showUpload));
      const hops = visibleHopsFor("en", "simple", showUpload);
      expect(hops.length).toBeGreaterThan(0);
      for (const h of hops) {
        expect(ids.has(h.source)).toBe(true);
        expect(ids.has(h.target)).toBe(true);
      }
    }
  });

  it("the ladder is cumulative: simple ⊆ intermediate ⊂ advanced (AC4)", () => {
    const simple = new Set(visibleStationIdsFor("simple"));
    const inter = new Set(visibleStationIdsFor("intermediate"));
    const adv = new Set(visibleStationIdsFor("advanced"));
    for (const id of simple) expect(inter.has(id)).toBe(true);
    for (const id of inter) expect(adv.has(id)).toBe(true);
    // 054-rag-block-expansion: Intermediate adds NO new station tile — the reranker
    // is a query-time sub-stage of the existing `rag` station — so its visible set
    // equals Simple's (the upgrade is inside the RAG block, not a floating node).
    expect(inter.size).toBe(simple.size);
    expect(adv.size).toBeGreaterThan(inter.size); // adds the AI-Ops tier + sub-agents
  });

  it("the rag station owns the rerank sub-stage (no separate reranker tile) (054)", () => {
    const rag = visibleStationsFor("en", "intermediate").find((s) => s.id === "rag");
    expect(rag?.stages).toContain("rag.rerank");
    // There is no standalone reranker station on any rung.
    for (const sc of ["simple", "intermediate", "advanced"] as const) {
      expect(visibleStationIdsFor(sc)).not.toContain("reranker");
    }
  });

  it("upper-rung stations are flagged comingSoon and never carry a live stage (AC4)", () => {
    const adv = visibleStationsFor("en", "advanced");
    const previews = adv.filter((s) => !BASE_STATIONS.includes(s.id));
    expect(previews.length).toBeGreaterThan(0);
    for (const s of previews) {
      expect(s.comingSoon).toBe(true);
      // No TraceEvent stage maps to a non-executing preview node — §3.
      expect(s.stages).toEqual([]);
    }
    // The base stations stay live (not coming soon).
    for (const s of adv.filter((x) => BASE_STATIONS.includes(x.id))) {
      expect(s.comingSoon ?? false).toBe(false);
      expect(s.stages.length).toBeGreaterThan(0);
    }
  });

  it("the upload nodes are real (not comingSoon) when revealed (035 AC7)", () => {
    const adv = visibleStationsFor("en", "advanced", true);
    for (const id of UPLOAD_STATIONS) {
      const s = adv.find((x) => x.id === id)!;
      expect(s, id).toBeDefined();
      expect(s.comingSoon ?? false).toBe(false);
      expect(s.stages.length).toBeGreaterThan(0);
    }
  });
});

describe("bilingual + cloud map for every element (AC6)", () => {
  for (const lang of ["en", "pt"] as const) {
    it(`every station has non-empty ${lang} prose + a full cloud map`, () => {
      // showUpload=true so the conditional upload nodes are covered too.
      for (const s of visibleStationsFor(lang, "advanced", true)) {
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
