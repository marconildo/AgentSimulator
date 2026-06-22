// 089-network-station-detail — pure-projection selectors for the five network-edge
// "open full view" drill-ins. Each reads the appliance's own stage END event and
// surfaces its typed forwarded-header evidence (or undefined when not in front).

import { describe, expect, it } from "vitest";

import {
  selectApiGw,
  selectCdn,
  selectDns,
  selectLb,
  selectWaf,
} from "./stationDetail";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

describe("network-edge detail selectors", () => {
  it("selectDns surfaces host, address and ttl from a seen event (AC1)", () => {
    seq = 0;
    const dns = selectDns([
      ev("dns", "end", { seen: true, host: "backend.internal", address: "10.0.0.4", ttl: 30 }),
    ]);
    expect(dns?.seen).toBe(true);
    expect(dns?.host).toBe("backend.internal");
    expect(dns?.address).toBe("10.0.0.4");
    expect(dns?.ttl).toBe(30);
  });

  it("selectCdn/Waf/Lb/ApiGw each surface their typed fields (AC2)", () => {
    const cdn = selectCdn([ev("cdn", "end", { seen: true, cache: "MISS", age: 0, server: "varnish-1" })]);
    expect(cdn).toMatchObject({ seen: true, cache: "MISS", server: "varnish-1" });

    const waf = selectWaf([
      ev("waf", "end", { seen: true, status: "clean", rules: 942, anomaly_score: 0, engine: "ModSecurity" }),
    ]);
    expect(waf).toMatchObject({ seen: true, status: "clean", rules: 942, engine: "ModSecurity" });

    const lb = selectLb([
      ev("lb", "end", { seen: true, tls_version: "TLSv1.3", scheme: "https", upstream: "kong:8000", server: "haproxy-1" }),
    ]);
    expect(lb).toMatchObject({ seen: true, tls_version: "TLSv1.3", upstream: "kong:8000" });

    const gw = selectApiGw([
      ev("apigw", "end", { seen: true, route: "chat", rate_limit_remaining: 59, upstream_latency_ms: 12, gateway: "kong" }),
    ]);
    expect(gw).toMatchObject({ seen: true, route: "chat", rate_limit_remaining: 59, gateway: "kong" });
  });

  it("returns undefined when the appliance has no event yet (AC3/AC8)", () => {
    expect(selectDns([ev("agent.route", "end")])).toBeUndefined();
    expect(selectLb([])).toBeUndefined();
  });

  it("preserves seen:false honestly (not-in-front, AC3)", () => {
    const dns = selectDns([ev("dns", "end", { seen: false, host: null, address: null, ttl: null })]);
    expect(dns?.seen).toBe(false);
    expect(dns?.address).toBeNull();
  });
});
