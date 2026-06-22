import { describe, expect, it } from "vitest";

import { DEFAULT_SELECTION, selectionOf } from "./selection";
import {
  HOP_PAIRS,
  hopsFor,
  publicBoundaryFor,
  stationForEvent,
  stationsFor,
  visibleHopsFor,
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

describe("network layer (088-network-layer)", () => {
  // 090-waf-after-lb: transit order DNS → CDN → TLS/LB → WAF → API-GW.
  const NETWORK = ["dns", "cdn", "lb", "waf", "apigw"];
  const withNetwork = selectionOf(["mcp", "network"], "react", "vector");

  it("AC4 — the five chain stations are visible only when network is on, in order", () => {
    const off = new Set(visibleStationIdsFor(DEFAULT_SELECTION));
    for (const id of NETWORK) expect(off.has(id as never)).toBe(false);

    const ids = visibleStationIdsFor(withNetwork);
    for (const id of NETWORK) expect(ids).toContain(id);
    // STATIONS_SRC declares them in transit order (between frontend and backend).
    const ordered = ids.filter((i) => NETWORK.includes(i));
    expect(ordered).toEqual(NETWORK);
    expect(ids.indexOf("frontend")).toBeLessThan(ids.indexOf("dns"));
    expect(ids.indexOf("apigw")).toBeLessThan(ids.indexOf("backend"));
  });

  it("AC4 — the chain replaces the direct frontend→backend hop", () => {
    const offPairs = visibleHopsFor("en", DEFAULT_SELECTION).map((h) => `${h.source}-${h.target}`);
    expect(offPairs).toContain("frontend-backend");

    const onPairs = visibleHopsFor("en", withNetwork).map((h) => `${h.source}-${h.target}`);
    // The direct hop is hidden; the six chain hops draw the real path instead.
    expect(onPairs).not.toContain("frontend-backend");
    for (const pair of [
      "frontend-dns",
      "dns-cdn",
      "cdn-lb",
      "lb-waf",
      "waf-apigw",
      "apigw-backend",
    ]) {
      expect(onPairs).toContain(pair);
    }
    // 090: the old WAF-before-LB wiring is gone.
    expect(onPairs).not.toContain("cdn-waf");
    expect(onPairs).not.toContain("waf-lb");
    expect(onPairs).not.toContain("lb-apigw");
  });

  it("AC3 (090) — the LB is the single TLS-termination point; the WAF hop is plaintext", () => {
    const hops = hopsFor("en");
    const cdnToLb = hops.find((h) => h.source === "cdn" && h.target === "lb")!;
    const lbToWaf = hops.find((h) => h.source === "lb" && h.target === "waf")!;
    expect(cdnToLb.protocol).toMatch(/TLS/);
    // Past the LB the request is decrypted — no TLS on the hop into the WAF.
    expect(lbToWaf.protocol).toBe("HTTP");
    expect(lbToWaf.protocol).not.toMatch(/TLS/);

    // Only the into-LB hop talks about terminating TLS — no double termination.
    const edgeHops = hops.filter((h) => ["dns", "cdn", "lb", "waf", "apigw"].includes(h.source));
    const terminate = edgeHops.filter((h) => /terminat/i.test(h.why ?? ""));
    expect(terminate).toHaveLength(1);
    expect(terminate[0].target).toBe("lb");
  });

  it("AC9 — every chain station has bilingual prose + a full cloud map", () => {
    for (const lang of ["en", "pt"] as const) {
      for (const id of NETWORK) {
        const s = stationsFor(lang).find((st) => st.id === id);
        expect(s, `${id} (${lang})`).toBeDefined();
        expect(s!.title.trim()).toBeTruthy();
        expect(s!.blurb.trim()).toBeTruthy();
        for (const cloud of ["azure", "aws", "gcp"] as const) {
          expect(s!.clouds[cloud]?.trim(), `${id}.clouds.${cloud}`).toBeTruthy();
        }
      }
    }
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

  // AC2 + 080 — owns the whole write-path (storage.upload + the five ingest stages)
  // and is a real (non-preview) station.
  it("owns the ingest stages and is not a comingSoon preview", () => {
    const ing = stationsFor("en").find((s) => s.id === "ingestion")!;
    expect(ing.stages).toEqual([
      "storage.upload",
      "rag.ingest.chunk",
      "rag.ingest.tokenize",
      "rag.ingest.embed",
      "rag.ingest.metadata",
      "rag.ingest.store",
    ]);
    expect(ing.comingSoon ?? false).toBe(false);
  });

  // AC8 — the rag node keeps the query-time stages (ingest.* live on `ingestion`).
  // 054-rag-block-expansion added the rerank sub-stage; 070-hybrid-search added the
  // hybrid (BM25 + vector RRF) sub-stage between search and rerank.
  it("leaves the rag station with the query-time stages (incl. hybrid + rerank)", () => {
    const rag = stationsFor("en").find((s) => s.id === "rag")!;
    expect(rag.stages).toEqual([
      "rag.embed",
      "rag.search",
      "rag.hybrid",
      "rag.rerank",
      "rag.retrieve",
    ]);
  });

  // 070-hybrid-search — the standalone `hybrid` preview tile was removed (hybrid is now
  // the rag.hybrid sub-stage of the rag station, not a tile of its own).
  it("no longer exposes a standalone hybrid station tile", () => {
    // `hybrid` was dropped from StationId in 070, so compare as a plain string.
    expect(stationsFor("en").some((s) => (s.id as string) === "hybrid")).toBe(false);
  });
});

describe("merged ingestion station + write-path (080-ingestion-pipeline-merge)", () => {
  // AC6 — the standalone Object Storage station is gone (folded into ingestion).
  it("no longer exposes a standalone storage station", () => {
    expect(stationsFor("en").some((s) => (s.id as string) === "storage")).toBe(false);
  });

  // AC1/AC5 — the ingestion station owns the whole write-path in order, with bilingual
  // prose + a full cloud map, and is a real (non-preview) station.
  it("owns the six ingest stages in order and is not a comingSoon preview", () => {
    const st = stationsFor("en").find((s) => s.id === "ingestion")!;
    expect(st.stages).toEqual([
      "storage.upload",
      "rag.ingest.chunk",
      "rag.ingest.tokenize",
      "rag.ingest.embed",
      "rag.ingest.metadata",
      "rag.ingest.store",
    ]);
    expect(st.comingSoon ?? false).toBe(false);
    for (const lang of ["en", "pt"] as const) {
      const s = stationsFor(lang).find((x) => x.id === "ingestion")!;
      expect(s.title.trim() && s.subtitle.trim() && s.blurb.trim()).toBeTruthy();
      expect(s.clouds.azure && s.clouds.aws && s.clouds.gcp).toBeTruthy();
    }
  });

  // AC6 — revealed by upload activity regardless of selection (035: real everywhere
  // but rendered only during an upload).
  it("is visible during an upload", () => {
    expect(visibleStationIdsFor(DEFAULT_SELECTION, true)).toContain("ingestion");
  });

  // AC8 — exactly two write-path hops remain (no backend→storage): backend→ingestion
  // and ingestion→rag, both bilingual + private.
  it("wires backend→ingestion and ingestion→rag with bilingual private hops, and no backend→storage", () => {
    for (const lang of ["en", "pt"] as const) {
      const hops = hopsFor(lang);
      expect(hops.some((h) => (h.target as string) === "storage")).toBe(false);
      for (const [source, target] of [
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

  // AC8 — the ingestion node has a real incoming and outgoing edge.
  it("gives the ingestion node a real incoming and outgoing edge", () => {
    expect(HOP_PAIRS.some((p) => p.target === "ingestion")).toBe(true);
    expect(HOP_PAIRS.some((p) => p.source === "ingestion")).toBe(true);
  });
});

describe("hop why enrichment (086-hop-detail-enrichment)", () => {
  // AC1 — every network hop carries a non-empty bilingual `why` (role + reasoning).
  it("every hop has a non-empty why in en and pt", () => {
    for (const lang of ["en", "pt"] as const) {
      for (const h of hopsFor(lang)) {
        expect(h.why?.trim(), `${h.source}→${h.target}.why (${lang})`).toBeTruthy();
      }
    }
  });

  // AC2 — the public (edge) hop explains the reverse proxy role + extras.
  it("the frontend→backend why explains the nginx reverse-proxy role + extras", () => {
    for (const lang of ["en", "pt"] as const) {
      const hop = hopsFor(lang).find((h) => h.source === "frontend" && h.target === "backend")!;
      const why = hop.why!.toLowerCase();
      expect(why).toMatch(/reverse proxy/);
      expect(why).toMatch(/tls/);
      // mentions load balancing…
      expect(why).toMatch(/balanc/);
      // …and that a reverse proxy can do more than proxy.
      expect(why).toMatch(/cache|gzip|rate|static|rout/);
    }
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
