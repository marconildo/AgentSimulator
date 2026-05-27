// 009-live-pacing — store glue. The pure reducer lives in lib/pacing.ts; here we
// pin the side-effecting parts: pushTrace no longer snaps the cursor to the live
// tail, a paced ticker advances it over time (without jumping), and the ticker is
// scoped to the live, *following* playhead so replay/scrub/tour are untouched.
// Fake timers keep these deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_STEP_MS } from "../lib/pacing";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { useSimulator } from "./useSimulator";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function fullRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "end", { answer: "Hello." }),
    ev("backend", "end", { answer: "Hello." }),
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

describe("live pacing store glue", () => {
  it("AC4 — pushTrace appends without snapping the cursor to the tail", () => {
    useSimulator.getState().beginRun();
    const events = fullRun();
    for (const e of events) useSimulator.getState().pushTrace(e);

    const s = useSimulator.getState();
    expect(s.events.length).toBe(events.length);
    expect(s.cursor).toBeLessThan(events.length - 1); // not snapped by the burst
  });

  it("AC4b — the paced ticker advances the live cursor without jumping to the tail", () => {
    useSimulator.getState().beginRun();
    const events = fullRun();
    for (const e of events) useSimulator.getState().pushTrace(e);

    vi.advanceTimersByTime(LIVE_STEP_MS * 3);

    const s = useSimulator.getState();
    expect(s.cursor).toBeGreaterThanOrEqual(2); // walked a few structural stages
    expect(s.cursor).toBeLessThan(events.length - 1); // but did not teleport
  });

  it("AC5 — the ticker makes no cursor changes when not following", () => {
    useSimulator.getState().beginRun();
    const events = fullRun();
    for (const e of events) useSimulator.getState().pushTrace(e);
    useSimulator.setState({ following: false, cursor: 2 }); // scrub / replay / tour

    vi.advanceTimersByTime(LIVE_STEP_MS * 5);

    expect(useSimulator.getState().cursor).toBe(2);
  });
});
