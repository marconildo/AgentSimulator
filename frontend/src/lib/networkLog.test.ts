// 091-network-appliance-detail-enrichment — the reconstructed appliance log line is
// built PURELY from the forwarded-header evidence (no fabricated request lines): each
// token maps to a real field, and a missing field is simply dropped. The drill-in
// renders it under an explicit "reconstructed from forwarded evidence" label.
import { describe, expect, it } from "vitest";

import { buildApplianceLog } from "./networkLog";

describe("buildApplianceLog (091)", () => {
  it("DNS — shows the resolution, or 'not resolved' when no address", () => {
    expect(buildApplianceLog("dns", { host: "backend", address: "172.28.0.5", ttl: 30 })).toContain(
      "172.28.0.5",
    );
    expect(buildApplianceLog("dns", { host: "backend", address: "172.28.0.5", ttl: 30 })).toContain(
      "ttl 30s",
    );
    expect(buildApplianceLog("dns", { host: "backend", address: null, ttl: null })).toMatch(
      /not resolved/i,
    );
  });

  it("CDN — surfaces the verdict, hits and the reason", () => {
    const line = buildApplianceLog("cdn", {
      cache: "BYPASS",
      hits: 0,
      reason: "uncacheable method (POST)",
      server: "varnish",
    });
    expect(line).toContain("BYPASS");
    expect(line).toContain("uncacheable method (POST)");
    expect(line).toContain("hits 0");
  });

  it("LB — shows the pool, algorithm and chosen backend", () => {
    const line = buildApplianceLog("lb", {
      tls_version: "TLSv1.3",
      upstream: "modsecurity:8080",
      pool_size: 1,
      algorithm: "roundrobin",
      backend: "modsecurity",
      server: "haproxy",
    });
    expect(line).toContain("1/1");
    expect(line).toContain("roundrobin");
    expect(line).toContain("modsecurity");
  });

  it("WAF — shows the verdict + config facts", () => {
    const line = buildApplianceLog("waf", {
      status: "clean",
      paranoia: 1,
      threshold: 5,
      engine: "modsecurity",
    });
    expect(line).toContain("clean");
    expect(line).toContain("PL1");
    expect(line).toContain("threshold 5");
  });

  it("API-GW — shows route + policy + gateway", () => {
    const line = buildApplianceLog("apigw", {
      route: "chat",
      policy: "rate-limit 60/min",
      gateway: "kong",
    });
    expect(line).toContain("chat");
    expect(line).toContain("rate-limit 60/min");
  });

  it("drops absent fields rather than printing null", () => {
    const line = buildApplianceLog("apigw", { route: "chat", policy: null, gateway: null });
    expect(line).not.toMatch(/null/);
    expect(line).toContain("chat");
  });
});
