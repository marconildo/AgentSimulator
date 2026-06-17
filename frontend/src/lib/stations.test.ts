import { describe, expect, it } from "vitest";

import { DEFAULT_SELECTION } from "./selection";
import {
  HOP_PAIRS,
  hopsFor,
  publicBoundaryFor,
  stationForEvent,
  stationsFor,
  visibleStationIdsFor,
} from "./stations";

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

  // AC1 — revealed by upload activity regardless of selection (035: the node is
  // real everywhere but rendered only during an upload).
  it("is visible during an upload", () => {
    expect(visibleStationIdsFor(DEFAULT_SELECTION, true)).toContain("ingestion");
  });

  // AC2 — owns the three ingest stages and is a real (non-preview) station.
  it("owns the ingest stages and is not a comingSoon preview", () => {
    const ing = stationsFor("en").find((s) => s.id === "ingestion")!;
    expect(ing.stages).toEqual(["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"]);
    expect(ing.comingSoon ?? false).toBe(false);
  });

  // AC8 — the rag node keeps the query-time stages (ingest.* live on `ingestion`).
  // 054-rag-block-expansion added the rerank sub-stage between search and retrieve.
  it("leaves the rag station with the query-time stages (incl. rerank)", () => {
    const rag = stationsFor("en").find((s) => s.id === "rag")!;
    expect(rag.stages).toEqual(["rag.embed", "rag.search", "rag.rerank", "rag.retrieve"]);
  });
});

describe("storage station + write-path (034-storage-ingestion-flow)", () => {
  // AC1/AC11 — a real station with bilingual prose + a filled cloud map.
  it("exists with bilingual prose and a full cloud map", () => {
    for (const lang of ["en", "pt"] as const) {
      const st = stationsFor(lang).find((s) => s.id === "storage");
      expect(st, `storage (${lang})`).toBeDefined();
      expect(st!.title.trim()).toBeTruthy();
      expect(st!.subtitle.trim()).toBeTruthy();
      expect(st!.blurb.trim()).toBeTruthy();
      expect(st!.clouds.azure && st!.clouds.aws && st!.clouds.gcp).toBeTruthy();
    }
  });

  // AC1 — revealed by upload activity regardless of selection (035: real
  // everywhere but rendered only during an upload).
  it("is visible during an upload", () => {
    expect(visibleStationIdsFor(DEFAULT_SELECTION, true)).toContain("storage");
  });

  // AC2 — owns the storage.upload stage and is a real (non-preview) station.
  it("owns storage.upload and is not a comingSoon preview", () => {
    const st = stationsFor("en").find((s) => s.id === "storage")!;
    expect(st.stages).toEqual(["storage.upload"]);
    expect(st.comingSoon ?? false).toBe(false);
  });

  // AC6 — the write-path hops exist, bilingual, private. The Backend orchestrates:
  // it persists the file to storage, then calls the indexer (backend→ingestion),
  // which upserts into the vector DB (ingestion→rag).
  it("wires backend→storage, backend→ingestion and ingestion→rag with bilingual private hops", () => {
    for (const lang of ["en", "pt"] as const) {
      const hops = hopsFor(lang);
      for (const [source, target] of [
        ["backend", "storage"],
        ["backend", "ingestion"],
        ["ingestion", "rag"],
      ] as const) {
        const hop = hops.find((h) => h.source === source && h.target === target);
        expect(hop, `${source}→${target} (${lang})`).toBeDefined();
        expect(hop!.label.trim()).toBeTruthy();
        expect(hop!.protocol.trim()).toBeTruthy();
        expect(hop!.detail.trim()).toBeTruthy();
        expect(hop!.controls.trim()).toBeTruthy();
        expect(hop!.zone).toBe("private");
      }
    }
  });

  // AC6 — the ingestion node is no longer hop-less (≥1 incoming, ≥1 outgoing).
  it("gives the ingestion node a real incoming and outgoing edge", () => {
    expect(HOP_PAIRS.some((p) => p.target === "ingestion")).toBe(true);
    expect(HOP_PAIRS.some((p) => p.source === "ingestion")).toBe(true);
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
