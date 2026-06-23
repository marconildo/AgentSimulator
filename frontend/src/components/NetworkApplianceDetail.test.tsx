/** @vitest-environment jsdom */
// 089-network-station-detail — the per-appliance "open full view" overlay shows
// the real per-run In → Out evidence; the TLS/LB box names its reverse-proxy role.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkApplianceDetail } from "./NetworkApplianceDetail";
import { useSimulator } from "../store/useSimulator";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}
function seed(events: TraceEvent[]): void {
  useSimulator.setState({ events, cursor: events.length - 1 });
}

afterEach(() => {
  cleanup();
  useSimulator.setState({ events: [], cursor: -1, blocked: null });
});

describe("NetworkApplianceDetail", () => {
  it("renders DNS host/address from a seen event (AC1)", () => {
    seq = 0;
    seed([ev("dns", "end", { seen: true, host: "backend.internal", address: "10.0.0.4", ttl: 30 })]);
    render(<NetworkApplianceDetail kind="dns" onClose={vi.fn()} />);
    expect(screen.getByText("backend.internal")).toBeTruthy();
    expect(screen.getByText("10.0.0.4")).toBeTruthy();
  });

  it("names the TLS/LB box as the reverse proxy and shows the upstream (AC2/AC5)", () => {
    seq = 0;
    seed([
      ev("lb", "end", {
        seen: true,
        tls_version: "TLSv1.3",
        scheme: "https",
        upstream: "kong:8000",
        server: "haproxy-1",
      }),
    ]);
    render(<NetworkApplianceDetail kind="lb" onClose={vi.fn()} />);
    expect(screen.getByText(/terminate TLS · forward to upstream/i)).toBeTruthy();
    expect(screen.getByText("kong:8000")).toBeTruthy();
  });

  it("shows the honest empty state when the appliance isn't in front (AC3)", () => {
    seed([ev("waf", "end", { seen: false, status: "unknown", rules: null, anomaly_score: null, engine: null })]);
    render(<NetworkApplianceDetail kind="waf" onClose={vi.fn()} />);
    expect(screen.getByText(/No WAF in front/i)).toBeTruthy();
  });

  it("is empty before the appliance's event at the cursor (AC8)", () => {
    seed([ev("agent.route", "end", { query: "hi" })]);
    render(<NetworkApplianceDetail kind="apigw" onClose={vi.fn()} />);
    expect(screen.getByText(/No API gateway in front/i)).toBeTruthy();
  });

  // 091-network-appliance-detail-enrichment
  it("CDN explains the bypass (reason + hits) and shows the reconstructed log (AC2/AC5)", () => {
    seq = 0;
    seed([
      ev("cdn", "end", {
        seen: true,
        cache: "BYPASS",
        hits: 0,
        reason: "uncacheable method (POST)",
        server: "varnish",
      }),
    ]);
    render(<NetworkApplianceDetail kind="cdn" onClose={vi.fn()} />);
    expect(screen.getByText("uncacheable method (POST)")).toBeTruthy();
    expect(screen.getByText(/Access log \(reconstructed\)/i)).toBeTruthy();
    expect(screen.getByText(/not a live container tail/i)).toBeTruthy();
  });

  it("LB shows the pool size, algorithm and chosen backend (AC3)", () => {
    seq = 0;
    seed([
      ev("lb", "end", {
        seen: true,
        tls_version: "TLSv1.3",
        upstream: "modsecurity:8080",
        pool_size: 1,
        algorithm: "roundrobin",
        backend: "modsecurity",
        server: "haproxy",
      }),
    ]);
    render(<NetworkApplianceDetail kind="lb" onClose={vi.fn()} />);
    expect(screen.getByText("roundrobin")).toBeTruthy();
    expect(screen.getAllByText("modsecurity").length).toBeGreaterThan(0);
  });

  // 092-network-appliance-real-io — the IN shows the real request, not generic prose.
  it("WAF IN shows the real request (POST /api/chat + message), not prose (092 AC1)", () => {
    seq = 0;
    seed([
      ev("frontend", "end", {
        message: "What is RAG?",
        request: { message: "What is RAG?", session_id: "s", top_k: 4, mode: "stream", model: "gpt-4.1-mini" },
      }),
      ev("waf", "end", { seen: true, status: "clean", engine: "modsecurity" }),
    ]);
    render(<NetworkApplianceDetail kind="waf" onClose={vi.fn()} />);
    expect(screen.getByText("POST /api/chat")).toBeTruthy();
    expect(screen.getByText("What is RAG?")).toBeTruthy();
  });

  it("DNS IN leads with the host queried (092 AC2)", () => {
    seq = 0;
    seed([ev("dns", "end", { seen: true, host: "backend", address: "172.28.0.2", ttl: 30 })]);
    render(<NetworkApplianceDetail kind="dns" onClose={vi.fn()} />);
    expect(screen.getByText("backend")).toBeTruthy();
  });

  it("HTTP appliance IN is an honest empty when no request is captured (092 AC4)", () => {
    seq = 0;
    seed([ev("cdn", "end", { seen: true, cache: "BYPASS", server: "varnish" })]);
    render(<NetworkApplianceDetail kind="cdn" onClose={vi.fn()} />);
    expect(screen.getByText(/No request captured/i)).toBeTruthy();
  });

  // 093-waf-block-visualization — the WAF drill-in explains a real 403 block.
  it("WAF drill-in shows the block (verdict/403/why) when the chain blocked the turn", () => {
    seq = 0;
    useSimulator.setState({
      events: [],
      cursor: -1,
      blocked: { at: "waf", httpStatus: 403, message: "<script>alert(1)</script>" },
    });
    render(<NetworkApplianceDetail kind="waf" onClose={vi.fn()} />);
    expect(screen.getByText("blocked")).toBeTruthy();
    expect(screen.getByText("403")).toBeTruthy();
    expect(screen.getByText(/never reached the backend/i)).toBeTruthy();
    // The real payload that tripped the WAF is shown as the input.
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
  });

  it("WAF shows config facts and an honest note when the score isn't forwarded (AC4/AC6)", () => {
    seq = 0;
    seed([
      ev("waf", "end", {
        seen: true,
        status: "clean",
        paranoia: 1,
        threshold: 5,
        anomaly_score: null,
        rules: null,
        engine: "modsecurity",
      }),
    ]);
    render(<NetworkApplianceDetail kind="waf" onClose={vi.fn()} />);
    expect(screen.getByText("clean")).toBeTruthy();
    expect(screen.getByText(/isn't forwarded upstream by ModSecurity/i)).toBeTruthy();
  });
});
