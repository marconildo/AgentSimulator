/** @vitest-environment jsdom */
// 085-hop-communication-detail — clicking an arrow opens its communication detail
// in the Inspector body: theory (from the hop meta) + the REAL data that crossed it
// this run, cursor-bounded. The edge chain (DNS·CDN·WAF·TLS/LB·API GW) renders here.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorPanel } from "./InspectorPanel";
import type { DerivedView } from "../lib/derive";
import { useSimulator } from "../store/useSimulator";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}, metrics: Record<string, number> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics };
}

function run(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "What is RAG?", request: { message: "What is RAG?", top_k: 4 } }),
    ev("edge", "end", { proxied: true, scheme: "https", proxy_server: "nginx", client_ip: "198.51.100.42", request_id: "req-1" }),
    ev("backend", "start"),
    ev("respond", "end", { answer: "RAG is retrieval-augmented generation." }),
  ];
}

// The hop branch returns before the component touches `view`, so a stub is fine.
const view = {} as DerivedView;

function seedHop(hopId: string, events: TraceEvent[]) {
  useSimulator.setState({ events, cursor: events.length - 1, selectedHop: hopId });
}

afterEach(() => {
  cleanup();
  useSimulator.setState({ events: [], cursor: -1, selectedHop: null });
});

describe("InspectorPanel — hop detail (085)", () => {
  it("frontend→backend (edge ran) shows the chain, forwarded headers, and the round-trip", () => {
    seedHop("frontend-backend", run());
    render(<InspectorPanel selected={null} view={view} onSelect={vi.fn()} />);

    // Header source → target.
    expect(screen.getByText(/Backend/)).toBeTruthy();
    // The edge chain segments now live on the public arrow.
    for (const label of ["DNS", "CDN", "WAF", "TLS / LB", "API GW"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // TLS/LB shows the real value; the others are flagged preview.
    expect(screen.getByText("nginx · https")).toBeTruthy();
    expect(screen.getAllByText("preview").length).toBeGreaterThanOrEqual(4);
    // The forwarded headers + the real round-trip.
    expect(screen.getByText("198.51.100.42")).toBeTruthy();
    expect(screen.getByText("req-1")).toBeTruthy();
    expect(screen.getByText(/"top_k": 4/)).toBeTruthy();
    expect(screen.getByText(/retrieval-augmented generation/)).toBeTruthy();
    // 086 — the "Why this hop" explainer covers the nginx reverse-proxy role.
    expect(screen.getByText("Why this hop")).toBeTruthy();
    expect(screen.getByText(/reverse proxy/i)).toBeTruthy();
  });

  it("a non-edge hop (backend→agent) still shows its Why this hop explainer", () => {
    seedHop("backend-agent", run());
    render(<InspectorPanel selected={null} view={view} onSelect={vi.fn()} />);
    expect(screen.getByText("Why this hop")).toBeTruthy();
    // A phrase unique to the why paragraph (mTLS also appears in protocol/controls).
    expect(screen.getByText(/holds tool access and model credentials/i)).toBeTruthy();
    // Run data is empty for this hop on this run (honest state).
    expect(screen.getByText(/Nothing crossed this hop/i)).toBeTruthy();
  });

  it("frontend→backend without an edge event shows a plain request (no chain)", () => {
    seedHop("frontend-backend", run().filter((e) => e.stage !== "edge"));
    render(<InspectorPanel selected={null} view={view} onSelect={vi.fn()} />);
    expect(screen.queryByText("API GW")).toBeNull();
    expect(screen.getByText(/"top_k": 4/)).toBeTruthy();
  });

  it("an empty hop shows the honest no-data note", () => {
    seedHop("backend-agent", run());
    render(<InspectorPanel selected={null} view={view} onSelect={vi.fn()} />);
    expect(screen.getByText(/Nothing crossed this hop/i)).toBeTruthy();
  });
});
