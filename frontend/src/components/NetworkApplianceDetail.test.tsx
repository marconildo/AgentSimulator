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
  useSimulator.setState({ events: [], cursor: -1 });
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
});
