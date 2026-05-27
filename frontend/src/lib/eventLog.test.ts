// 030-event-console — the pure projection behind the expandable trace log:
// events + cursor → console rows (relative time, station, payload size, latency,
// from→to) and the copy/export value builders. Same source as deriveView, so
// live streaming and replay are one code path.

import { describe, expect, it } from "vitest";

import { eventJson, eventLog, formatRel, traceId, traceJson } from "./eventLog";
import { STAGE_TO_STATION } from "./stations";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  ts: number,
  data: Record<string, unknown> = {},
  metrics: Record<string, number> = {},
): TraceEvent {
  return { trace_id: "trace-abc", seq: seq++, ts, stage, phase, label: `${stage} ran`, data, metrics };
}

// ts are seconds-since-epoch (Python time.time()); the projection normalizes.
function trace(): TraceEvent[] {
  seq = 0;
  return [
    ev("backend", "start", 1000.0),
    ev("agent.route", "end", 1000.158, { query: "hi" }, { latency_ms: 12 }),
    ev("rag.embed", "end", 1000.412, { dim: 1536 }, { latency_ms: 412 }),
    ev("llm.generate", "end", 1001.0, { answer: "done" }, { latency_ms: 588, tokens: 9 }),
    ev("backend", "end", 1001.2, { answer: "done" }, { latency_ms: 1200 }),
  ];
}

describe("eventLog rows (030-event-console AC1)", () => {
  it("yields one row per event up to the cursor, in seq order, with relative time", () => {
    const events = trace();
    const rows = eventLog(events, events.length - 1);
    expect(rows).toHaveLength(events.length);
    expect(rows.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(rows[0].relMs).toBe(0); // first row is +0.000s
    expect(rows[1].relMs).toBeCloseTo(158, 1); // 1000.158 - 1000.0 → 158ms
    for (const r of rows) {
      expect(r.stage).toBeTruthy();
      expect(r.phase).toBeTruthy();
      expect(r.label).toBeTruthy();
    }
    expect(formatRel(0)).toBe("+0.000s");
    expect(formatRel(158)).toBe("+0.158s");
  });

  it("returns nothing before the first event (cursor < 0)", () => {
    expect(eventLog(trace(), -1)).toEqual([]);
  });
});

describe("eventLog cursor tracking (AC2)", () => {
  it("marks the cursor row current and shows nothing past it", () => {
    const events = trace();
    const rows = eventLog(events, 2); // cursor on rag.embed
    expect(rows).toHaveLength(3); // only up to the cursor
    expect(rows[rows.length - 1].current).toBe(true);
    expect(rows.filter((r) => r.current)).toHaveLength(1);
    expect(rows.some((r) => r.index > 2)).toBe(false);
  });

  it("moves the current mark as the cursor advances/retreats", () => {
    const events = trace();
    expect(eventLog(events, 1).find((r) => r.current)?.index).toBe(1);
    expect(eventLog(events, 3).find((r) => r.current)?.index).toBe(3);
  });
});

describe("eventLog drill-down (AC3)", () => {
  it("derives station, payload byte size, latency and from→to", () => {
    const events = trace();
    const rows = eventLog(events, events.length - 1);

    // owning station via STAGE_TO_STATION
    expect(rows[1].station).toBe(STAGE_TO_STATION["agent.route"]);
    expect(rows[2].station).toBe(STAGE_TO_STATION["rag.embed"]);

    // payload size = byte length of the serialized data
    const expectedSize = new TextEncoder().encode(JSON.stringify(events[1].data)).length;
    expect(rows[1].sizeBytes).toBe(expectedSize);

    // latency from metrics.latency_ms on END events; START has none
    expect(rows[1].latencyMs).toBe(12);
    expect(rows[0].latencyMs).toBeUndefined(); // backend START

    // cross-station event exposes from→to (agent → rag at the embed row)
    expect(rows[2].from).toBe(STAGE_TO_STATION["agent.route"]);
    expect(rows[2].to).toBe(STAGE_TO_STATION["rag.embed"]);
    // same-station consecutive (backend start→… ) has no from/to jump
    expect(rows[0].from).toBeUndefined();
  });
});

describe("eventLog copy/export (AC4)", () => {
  it("builds the exact JSON / trace-id payloads handed to the clipboard", () => {
    const events = trace();
    expect(eventJson(events[1])).toBe(JSON.stringify(events[1], null, 2));
    expect(JSON.parse(eventJson(events[1])).stage).toBe("agent.route");

    expect(traceJson(events)).toBe(JSON.stringify(events, null, 2));
    expect(JSON.parse(traceJson(events))).toHaveLength(events.length);

    expect(traceId(events)).toBe("trace-abc");
    expect(traceId([])).toBe("");
  });
});
