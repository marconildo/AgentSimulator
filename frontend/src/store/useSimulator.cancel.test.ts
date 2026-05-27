// 016-cancel-stream (AC3) — cancelling an in-flight run is terminal but
// non-destructive: it aborts the run's signal, stops the live ticker and marks
// the simulator `cancelled`, WITHOUT clearing the partial trace. Whatever events
// already arrived stay on the canvas, replayable/step-able from the preserved
// cursor; a subsequent `beginRun()` starts clean. Fake timers keep the paced
// ticker deterministic (mirrors useSimulator.pacing.test.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isFlowSettled } from "../lib/chatStatus";
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

describe("useSimulator — cancelRun (016-cancel-stream)", () => {
  it("AC3 — marks the run cancelled, aborts the signal, and preserves events/cursor", () => {
    const signal = useSimulator.getState().beginRun();
    const events = fullRun();
    for (const e of events) useSimulator.getState().pushTrace(e);
    // Walk the paced playhead into the middle of the trace (not the tail).
    vi.advanceTimersByTime(LIVE_STEP_MS * 3);

    const cursorBefore = useSimulator.getState().cursor;
    expect(cursorBefore).toBeGreaterThanOrEqual(0);
    expect(cursorBefore).toBeLessThan(events.length - 1);

    useSimulator.getState().cancelRun();

    const s = useSimulator.getState();
    expect(s.status).toBe("cancelled");
    expect(signal.aborted).toBe(true); // the in-flight request's signal was aborted
    expect(s.events).toEqual(events); // partial trace is kept on the canvas
    expect(s.cursor).toBe(cursorBefore); // cursor preserved → replay/step still work
  });

  it("AC3 — the live ticker stops after cancel (cursor no longer advances)", () => {
    useSimulator.getState().beginRun();
    for (const e of fullRun()) useSimulator.getState().pushTrace(e);
    vi.advanceTimersByTime(LIVE_STEP_MS * 2);

    useSimulator.getState().cancelRun();
    const frozen = useSimulator.getState().cursor;

    vi.advanceTimersByTime(LIVE_STEP_MS * 6);
    expect(useSimulator.getState().cursor).toBe(frozen);
  });

  it("AC3 — step/replay still drive the preserved partial trace", () => {
    useSimulator.getState().beginRun();
    for (const e of fullRun()) useSimulator.getState().pushTrace(e);
    vi.advanceTimersByTime(LIVE_STEP_MS * 2);
    useSimulator.getState().cancelRun();

    useSimulator.getState().setCursor(0);
    expect(useSimulator.getState().cursor).toBe(0);
    useSimulator.getState().step(1);
    expect(useSimulator.getState().cursor).toBe(1);
  });

  it("AC3 — a subsequent beginRun resets cleanly", () => {
    useSimulator.getState().beginRun();
    for (const e of fullRun()) useSimulator.getState().pushTrace(e);
    useSimulator.getState().cancelRun();

    useSimulator.getState().beginRun();
    const s = useSimulator.getState();
    expect(s.status).toBe("streaming");
    expect(s.events).toEqual([]);
    expect(s.cursor).toBe(-1);
  });

  it("cancelRun is a no-op when no run is active (idle)", () => {
    useSimulator.getState().cancelRun();
    expect(useSimulator.getState().status).toBe("idle");
  });

  it("isFlowSettled treats a cancelled run as terminal (nothing hangs)", () => {
    useSimulator.getState().beginRun();
    for (const e of fullRun()) useSimulator.getState().pushTrace(e);
    vi.advanceTimersByTime(LIVE_STEP_MS * 2);
    useSimulator.getState().cancelRun();
    expect(isFlowSettled(useSimulator.getState())).toBe(true);
  });
});
