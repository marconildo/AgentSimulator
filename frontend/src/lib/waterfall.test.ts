// 015-latency-waterfall — `waterfallSegments` is a pure projection of the event
// log into an ordered, per-occurrence timing breakdown (the Chrome-DevTools
// waterfall). These tests pin the spec's acceptance criteria at the logic level
// so the panel can be reasoned about without rendering.
//
// Timestamps use a realistic Unix-*milliseconds* base so `toMs` passes them
// through unchanged (toMs only scales values < 1e12), giving exact integer ms
// durations — no float drift in the assertions.

import { describe, expect, it } from "vitest";

import { LANGS } from "../i18n";
import { UI } from "../i18n/strings";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { formatLatency } from "./time";
import { waterfallSegments } from "./waterfall";

const BASE = 1_700_000_000_000; // Unix ms; toMs returns values ≥ 1e12 unchanged

let seq = 0;
function ev(stage: Stage, phase: Phase, atMs: number): TraceEvent {
  return {
    trace_id: "t",
    seq: seq++,
    ts: BASE + atMs,
    stage,
    phase,
    label: "",
    data: {},
    metrics: {},
  };
}

// A plain, no-tool run with START/END pairs and small inter-phase gaps. The
// gaps + the backend envelope make up the reconciling overhead. Durations
// (ms): route 8, retrieve 47, reason 824, generate 718, respond 5.
function linearRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", 0), // request (instant; transit lives in overhead)
    ev("backend", "start", 1), // envelope — excluded from the bars
    ev("agent.route", "start", 2),
    ev("agent.route", "end", 10), // route: 8
    ev("rag.embed", "start", 12),
    ev("rag.retrieve", "end", 59), // retrieve: 47
    ev("agent.think", "start", 60),
    ev("llm.prompt", "end", 884), // reason: 824
    ev("llm.generate", "start", 885),
    ev("llm.generate", "end", 1603), // generate: 718
    ev("respond", "start", 1604),
    ev("respond", "end", 1609), // respond: 5
    ev("backend", "end", 1610), // envelope — excluded; sets the wall-clock end
  ];
}

// A ReAct run that loops once (reason → tools → reason → generate), bracketed by
// the backend envelope. reason occurs twice; request must appear exactly once
// (the trailing backend/end must NOT spawn a second request bar).
function reactRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", 0), // request
    ev("backend", "start", 1), // envelope
    ev("agent.route", "start", 2),
    ev("agent.route", "end", 6), // route: 4
    ev("rag.embed", "start", 7),
    ev("rag.retrieve", "end", 11), // retrieve: 4
    // loop 1: reason → tools
    ev("agent.think", "start", 12),
    ev("llm.prompt", "end", 300),
    ev("agent.think", "end", 301), // reason #1: 289
    ev("mcp.call", "start", 302),
    ev("mcp.call", "end", 501), // tools: 199
    // loop 2: reason → answer
    ev("agent.think", "start", 502),
    ev("llm.prompt", "end", 800),
    ev("agent.think", "end", 801), // reason #2: 299
    ev("llm.generate", "start", 802),
    ev("llm.generate", "end", 1201), // generate: 399
    ev("respond", "start", 1202),
    ev("respond", "end", 1206), // respond: 4
    ev("backend", "end", 1210), // envelope — sets the wall-clock end
  ];
}

describe("waterfallSegments — ordered breakdown (AC1)", () => {
  it("maps the log to ordered { label, durationMs, offsetMs } segments in run order", () => {
    const { segments, totalMs } = waterfallSegments(linearRun());

    // One bar per timed phase occurrence, in run order, with a final overhead bar.
    expect(segments.map((s) => s.label)).toEqual([
      "request",
      "route",
      "retrieve",
      "reason",
      "generate",
      "respond",
      "overhead",
    ]);

    // First segment's offset is the run start (≈ 0).
    expect(segments[0].offsetMs).toBe(0);

    // Each segment's offset is its first event's ms from the run start.
    const byLabel = Object.fromEntries(segments.map((s) => [s.label, s]));
    expect(byLabel.route.offsetMs).toBe(2);
    expect(byLabel.retrieve.offsetMs).toBe(12);
    expect(byLabel.reason.offsetMs).toBe(60);
    expect(byLabel.generate.offsetMs).toBe(885);

    // Durations are the wall-clock footprint of each occurrence.
    expect(byLabel.route.durationMs).toBe(8);
    expect(byLabel.retrieve.durationMs).toBe(47);
    expect(byLabel.reason.durationMs).toBe(824);
    expect(byLabel.generate.durationMs).toBe(718);
    expect(byLabel.respond.durationMs).toBe(5);

    expect(totalMs).toBe(1610);
  });

  it("returns an empty breakdown for an empty log", () => {
    expect(waterfallSegments([])).toEqual({ segments: [], totalMs: 0 });
  });
});

describe("waterfallSegments — repeated phases (AC2)", () => {
  it("yields N separate segments for a phase that occurs N times, order preserved", () => {
    const { segments } = waterfallSegments(reactRun());

    const labels = segments.map((s) => s.label);
    expect(labels).toEqual([
      "request",
      "route",
      "retrieve",
      "reason",
      "tools",
      "reason",
      "generate",
      "respond",
      "overhead",
    ]);

    // reason fired twice → two distinct bars; tools once.
    expect(labels.filter((l) => l === "reason")).toHaveLength(2);
    expect(labels.filter((l) => l === "tools")).toHaveLength(1);

    // Order preserved: the first reason occurrence precedes the second.
    const reasons = segments.filter((s) => s.label === "reason");
    expect(reasons[0].offsetMs).toBeLessThan(reasons[1].offsetMs);
    expect(reasons[0].durationMs).toBe(289);
    expect(reasons[1].durationMs).toBe(299);
  });
});

describe("waterfallSegments — wall-clock reconciliation (AC3, AC4)", () => {
  it("total is the wall-clock span; backend envelope is excluded; remainder is one overhead bar", () => {
    const { segments, totalMs } = waterfallSegments(reactRun());

    // Total = last ts − first ts (the full wall-clock span).
    expect(totalMs).toBe(1210);

    // The wrapping backend stage is never a bar (it would double-count the total),
    // and the trailing backend/end does not spawn a second `request` bar.
    expect(segments.some((s) => (s.label as string) === "backend")).toBe(false);
    expect(segments.filter((s) => s.label === "request")).toHaveLength(1);

    // Σ all segment durations (incl. overhead) === total, so nothing is faked.
    const sum = segments.reduce((a, s) => a + s.durationMs, 0);
    expect(sum).toBe(totalMs);

    // The unattributed remainder is a single trailing overhead bar.
    const overhead = segments[segments.length - 1];
    expect(overhead.label).toBe("overhead");
    // attributed = 0+4+4+289+199+299+399+4 = 1198 → overhead = 12.
    expect(overhead.durationMs).toBe(12);
  });

  it("formats durations via formatLatency (whole ms; sub-ms floors to <1 ms) (AC4)", () => {
    const { segments } = waterfallSegments(reactRun());
    const byOrder = segments;

    // A measured 289 ms reason renders as whole milliseconds.
    const reason = byOrder.find((s) => s.label === "reason")!;
    expect(formatLatency(reason.durationMs)).toBe("289 ms");

    // The instant `request` (a single END event) has a 0 ms footprint → "<1 ms",
    // never "0 ms".
    const request = byOrder.find((s) => s.label === "request")!;
    expect(request.durationMs).toBe(0);
    expect(formatLatency(request.durationMs)).toBe("<1 ms");
  });
});

describe("timeline.timing strings — bilingual (AC5)", () => {
  it("has title/total/overhead/empty in both en and pt", () => {
    for (const { code } of LANGS) {
      const timing = UI[code].timeline.timing;
      expect(timing.title, `${code}/title`).toBeTruthy();
      expect(timing.total, `${code}/total`).toBeTruthy();
      expect(timing.overhead, `${code}/overhead`).toBeTruthy();
      expect(timing.empty, `${code}/empty`).toBeTruthy();
    }
  });
});

describe("waterfallSegments is pure (does not mutate input)", () => {
  it("is deterministic and leaves a frozen input untouched", () => {
    const events = Object.freeze(linearRun()) as TraceEvent[];
    const a = waterfallSegments(events);
    const b = waterfallSegments(events);
    expect(a).toEqual(b);
  });
});
