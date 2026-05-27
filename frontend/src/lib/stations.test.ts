import { describe, expect, it } from "vitest";

import { publicBoundaryFor, stationForEvent, stationsFor, visibleStationIdsFor } from "./stations";

describe("station tech rows", () => {
  it("never bakes a model literal into the static visual model (B2)", () => {
    // A model string hardcoded here drifts from the real one the moment LLM_MODEL
    // changes in the env — exactly the gpt-4o-mini vs gpt-4.1-mini mismatch the
    // assessment caught. The LLM block must read its model live from /api/health.
    for (const station of stationsFor("en")) {
      for (const row of station.tech) {
        expect(row.v).not.toMatch(/gpt-\d/i);
      }
    }
  });
});

describe("why / whatBreaks (028-why-this-layer)", () => {
  // AC1 — every executing station (one with live `stages`) resolves a non-empty
  // why + whatBreaks in both languages. Preview nodes (stages: []) are exempt.
  it("every executing station has why + whatBreaks in en and pt", () => {
    for (const lang of ["en", "pt"] as const) {
      for (const s of stationsFor(lang)) {
        if (s.stages.length === 0) continue;
        expect(s.why?.trim(), `${s.id}.why (${lang})`).toBeTruthy();
        expect(s.whatBreaks?.trim(), `${s.id}.whatBreaks (${lang})`).toBeTruthy();
      }
    }
  });

  // AC4 — honest caveats land where they belong (substring/keyword presence so
  // the wording can evolve without breaking the test).
  it("surfaces the honest caveats (auth stub · MCP HTTP/SSE · App DB pooling)", () => {
    const byId = (lang: "en" | "pt") =>
      Object.fromEntries(stationsFor(lang).map((s) => [s.id, s] as const));
    const en = byId("en");
    const pt = byId("pt");

    // Public-edge stations: authentication is a stub in the demo.
    for (const id of ["frontend", "backend"] as const) {
      expect(en[id].whatBreaks).toMatch(/auth/i);
      expect(pt[id].whatBreaks).toMatch(/autentica/i);
    }
    // MCP: stdio is one transport — HTTP/SSE is the out-of-process alternative.
    expect(en.mcp.whatBreaks).toMatch(/SSE/i);
    expect(pt.mcp.whatBreaks).toMatch(/SSE/i);
    // App DB: the single-instance / connection-pool assumption.
    expect(en.database.whatBreaks).toMatch(/pool/i);
    expect(pt.database.whatBreaks).toMatch(/pool/i);
  });
});

describe("ingestion station (033-ingestion-node)", () => {
  // AC1/AC9 — a real station with bilingual prose + a filled cloud map.
  it("exists with bilingual prose and a full cloud map", () => {
    for (const lang of ["en", "pt"] as const) {
      const ing = stationsFor(lang).find((s) => s.id === "ingestion");
      expect(ing, `ingestion (${lang})`).toBeDefined();
      expect(ing!.title.trim()).toBeTruthy();
      expect(ing!.subtitle.trim()).toBeTruthy();
      expect(ing!.blurb.trim()).toBeTruthy();
      expect(ing!.clouds.azure && ing!.clouds.aws && ing!.clouds.gcp).toBeTruthy();
    }
  });

  // AC1 — visible in every scenario (ingestion is real everywhere).
  it("is visible in simple, intermediate and advanced", () => {
    for (const sc of ["simple", "intermediate", "advanced"] as const) {
      expect(visibleStationIdsFor(sc)).toContain("ingestion");
    }
  });

  // AC2 — owns the three ingest stages and is a real (non-preview) station.
  it("owns the ingest stages and is not a comingSoon preview", () => {
    const ing = stationsFor("en").find((s) => s.id === "ingestion")!;
    expect(ing.stages).toEqual(["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"]);
    expect(ing.comingSoon ?? false).toBe(false);
  });

  // AC8 — the query-time rag node keeps only embed/search/retrieve.
  it("leaves the rag station with only the query-time stages", () => {
    const rag = stationsFor("en").find((s) => s.id === "rag")!;
    expect(rag.stages).toEqual(["rag.embed", "rag.search", "rag.retrieve"]);
  });
});

describe("public frontier (032-network-boundary)", () => {
  // AC5 — a bilingual, non-empty label.
  it("has a bilingual, non-empty label", () => {
    expect(publicBoundaryFor("en").label.trim()).toBeTruthy();
    expect(publicBoundaryFor("pt").label.trim()).toBeTruthy();
  });

  // AC2 — cloud-generic: no clouds map, so the label never resolves per provider.
  it("is cloud-generic (no clouds map, identical in every cloud)", () => {
    const f = publicBoundaryFor("en");
    expect("clouds" in f).toBe(false);
    expect(f.label).toMatch(/egress/i);
    expect(publicBoundaryFor("pt").label).toMatch(/egress/i);
  });
});

describe("stationForEvent (B5)", () => {
  it("maps a phase's first event to the station that owns its stage", () => {
    expect(stationForEvent([{ stage: "db.read" }], 0)).toBe("database");
    expect(stationForEvent([{ stage: "rag.retrieve" }], 0)).toBe("rag");
    expect(stationForEvent([{ stage: "mcp.call" }], 0)).toBe("mcp");
    expect(stationForEvent([{ stage: "llm.generate" }], 0)).toBe("llm");
  });

  it("returns undefined for an out-of-range index", () => {
    expect(stationForEvent([], 3)).toBeUndefined();
  });
});
