// 005-guided-tour — the store driver. The pure reducer lives in lib/tour.ts;
// here we pin the side-effecting glue: the tour is gated on a replayable trace
// (AC5), applies the first step immediately (cursor + selected station), and is
// mutually exclusive with raw replay. Timer-driven advancement uses a 3.5s
// interval, so these synchronous assertions never wait on it.

import { beforeEach, describe, expect, it } from "vitest";

import { currentStep, tourSteps } from "../lib/tour";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { useSimulator } from "./useSimulator";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function run(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.embed", "end", { dim: 1536 }),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "end", { answer: "Hello." }),
    ev("db.write", "end", { operation: "INSERT" }),
    ev("backend", "end", { answer: "Hello." }),
  ];
}

beforeEach(() => {
  useSimulator.getState().reset();
});

describe("startTour gating (AC5)", () => {
  it("is a no-op with no trace", () => {
    useSimulator.getState().startTour();
    const s = useSimulator.getState();
    expect(s.tour.status).toBe("idle");
    expect(s.selected).toBeNull();
  });

  it("starts playing and applies the first step (cursor + station) with a trace", () => {
    const events = run();
    useSimulator.setState({ events, status: "done", cursor: events.length - 1 });

    useSimulator.getState().startTour();

    const s = useSimulator.getState();
    const first = tourSteps(events)[0];
    expect(s.tour.status).toBe("playing");
    expect(currentStep(s.tour)?.phase).toBe("request");
    expect(s.cursor).toBe(first.cursor);
    expect(s.selected).toBe(first.station);

    useSimulator.getState().stopTour();
  });
});

describe("pause / stop transitions (AC3)", () => {
  it("pause freezes, stop clears the forced selection", () => {
    const events = run();
    useSimulator.setState({ events, status: "done", cursor: events.length - 1 });
    useSimulator.getState().startTour();

    useSimulator.getState().pauseTour();
    expect(useSimulator.getState().tour.status).toBe("paused");

    useSimulator.getState().resumeTour();
    expect(useSimulator.getState().tour.status).toBe("playing");

    useSimulator.getState().stopTour();
    const s = useSimulator.getState();
    expect(s.tour.status).toBe("idle");
    expect(s.selected).toBeNull();
  });
});

describe("mutual exclusion with replay", () => {
  it("starting replay stops a running tour", () => {
    const events = run();
    useSimulator.setState({ events, status: "done", cursor: events.length - 1 });
    useSimulator.getState().startTour();
    expect(useSimulator.getState().tour.status).toBe("playing");

    useSimulator.getState().togglePlay();
    expect(useSimulator.getState().tour.status).toBe("idle");

    useSimulator.getState().togglePlay(); // stop the replay timer we just started
  });

  it("starting a tour stops replay", () => {
    const events = run();
    useSimulator.setState({ events, status: "done", cursor: -1 });
    useSimulator.getState().togglePlay();
    expect(useSimulator.getState().playing).toBe(true);

    useSimulator.getState().startTour();
    expect(useSimulator.getState().playing).toBe(false);
    expect(useSimulator.getState().tour.status).toBe("playing");

    useSimulator.getState().stopTour();
  });
});
