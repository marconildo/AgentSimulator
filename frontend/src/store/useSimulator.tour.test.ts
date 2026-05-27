// 005-guided-tour — the store driver. The pure reducer lives in lib/tour.ts;
// here we pin the side-effecting glue: the tour is gated on a replayable trace
// (AC5), applies the first step immediately (cursor + selected station), and is
// mutually exclusive with raw replay. Timer-driven advancement uses a 3.5s
// interval, so these synchronous assertions never wait on it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentStep, isTouring, TOUR_PACE_MS, tourSteps } from "../lib/tour";
import { tourTrace } from "../lib/tourTrace";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { useSimulator } from "./useSimulator";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// Exactly the projection App.tsx feeds into deriveView as `tourStation`: the
// narrated station while touring, null when idle/done. Pinning it here keeps the
// store-level tour driver in lockstep with what the canvas emphasizes (014 AC3).
function tourStationOf(s = useSimulator.getState()) {
  return isTouring(s.tour) ? (currentStep(s.tour)?.station ?? null) : null;
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

afterEach(() => {
  // Restore real timers for tests that fake them; reset clears any tour timer.
  vi.useRealTimers();
  useSimulator.getState().reset();
});

describe("startTour from an empty state (014 AC6)", () => {
  // 014-tour-scripted supersedes 005 AC5's empty-state gating: ▶ Tour from an
  // empty state now loads the bundled canned trace and walks it — no backend
  // call, no OpenAI — so a first-time visitor can preview the journey.
  it("loads the bundled canned trace and begins playing", () => {
    expect(useSimulator.getState().events).toHaveLength(0);

    useSimulator.getState().startTour();

    const s = useSimulator.getState();
    expect(s.events).toEqual(tourTrace); // canned trace loaded in place
    expect(s.tour.status).toBe("playing");
    expect(currentStep(s.tour)).not.toBeNull();
    // The first stop is applied immediately: the playhead jumps to its cursor.
    expect(s.cursor).toBe(currentStep(s.tour)!.cursor);
    expect(tourStationOf(s)).toBe(currentStep(s.tour)!.station);

    useSimulator.getState().stopTour();
  });
});

describe("tour emphasis clears on stop / done (014 AC3)", () => {
  it("clears the emphasized station (and forced selection) on stop", () => {
    useSimulator.getState().startTour(); // loads the canned trace, begins
    expect(tourStationOf()).not.toBeNull();

    useSimulator.getState().stopTour();

    expect(tourStationOf()).toBeNull();
    expect(useSimulator.getState().selected).toBeNull();
  });

  it("ends as done and releases emphasis once the last stop passes", () => {
    vi.useFakeTimers();
    useSimulator.getState().startTour();
    const steps = useSimulator.getState().tour.steps.length;
    expect(steps).toBeGreaterThan(0);

    // Drive the tour timer past the final stop → it auto-stops at `done`.
    vi.advanceTimersByTime(TOUR_PACE_MS * (steps + 1));

    const s = useSimulator.getState();
    expect(s.tour.status).toBe("done");
    expect(tourStationOf(s)).toBeNull();
    expect(s.selected).toBeNull();
  });
});

describe("startTour gating (AC5, with a prior run)", () => {
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
