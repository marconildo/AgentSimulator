// 022-message-trace-link (T3) — `loadTrace(events)` statically loads a finished
// (past) turn's trace onto the canvas: events in, cursor at the tail, settled
// `done`, no live/replay/tour timers (per the non-goal: no auto-replay; the user
// can press play). `deriveView` renders it and step/replay operate over it (AC1).
// It is a no-op while a live run is streaming, and a fresh `beginRun` after a
// load starts clean (AC3).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { useSimulator } from "./useSimulator";

let seq = 0;
function ev(stage: Stage, phase: Phase): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data: {}, metrics: {} };
}

function pastTrace(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end"),
    ev("backend", "start"),
    ev("agent.think", "end"),
    ev("respond", "end"),
    ev("backend", "end"),
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  useSimulator.getState().reset();
});

afterEach(() => {
  useSimulator.getState().reset();
  vi.useRealTimers();
});

describe("useSimulator — loadTrace (022)", () => {
  it("AC1 — loads a past trace settled at the tail", () => {
    const events = pastTrace();
    useSimulator.getState().loadTrace(events);

    const s = useSimulator.getState();
    expect(s.events).toEqual(events);
    expect(s.cursor).toBe(events.length - 1);
    expect(s.status).toBe("done");
    expect(s.following).toBe(false);
    expect(s.playing).toBe(false);
  });

  it("AC1 — step and replay operate over the loaded trace", () => {
    const events = pastTrace();
    useSimulator.getState().loadTrace(events);

    // Step back from the tail, then forward.
    useSimulator.getState().setCursor(0);
    expect(useSimulator.getState().cursor).toBe(0);
    useSimulator.getState().step(1);
    expect(useSimulator.getState().cursor).toBe(1);

    // Replay drives the playhead.
    useSimulator.getState().togglePlay();
    expect(useSimulator.getState().playing).toBe(true);
    useSimulator.getState().togglePlay();
    expect(useSimulator.getState().playing).toBe(false);
  });

  it("AC3 — is a no-op while a live run is streaming", () => {
    useSimulator.getState().beginRun(); // status → streaming, events cleared
    const before = useSimulator.getState().events;

    useSimulator.getState().loadTrace(pastTrace());

    const s = useSimulator.getState();
    expect(s.status).toBe("streaming");
    expect(s.events).toEqual(before); // untouched — the live run is protected
  });

  it("AC3 — a fresh beginRun after loadTrace starts clean", () => {
    useSimulator.getState().loadTrace(pastTrace());

    useSimulator.getState().beginRun();
    const s = useSimulator.getState();
    expect(s.status).toBe("streaming");
    expect(s.events).toEqual([]);
    expect(s.cursor).toBe(-1);
  });
});
