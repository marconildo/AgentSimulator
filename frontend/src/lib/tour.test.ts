// 005-guided-tour — the tour is a pure reducer that walks 004's phase markers
// one phase at a time, yielding {cursor, station, phase} for the driver to apply
// (setCursor + select + caption). These tests pin the acceptance criteria
// (AC1–AC6) at the reducer/caption level, with no timers or rendering.

import { describe, expect, it } from "vitest";

import { LANGS } from "../i18n";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { PHASE_ORDER, type TimelinePhase } from "./phases";
import { STAGE_TO_STATION } from "./stations";
import {
  beginTour,
  currentStep,
  IDLE_TOUR,
  pauseTour,
  resumeTour,
  stopTour,
  TOUR_PACE_MS,
  tourCaptionsFor,
  tourLabelsFor,
  tourNarrationFor,
  tourNext,
  tourPrev,
  tourStep,
  tourSteps,
  type TourStep,
} from "./tour";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// A plain no-tool run: request → memory → route → retrieve → reason → generate →
// respond → persist (no `tools` phase).
function plainRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "start"),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.embed", "start"),
    ev("rag.embed", "end", { dim: 1536 }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "start"),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.prompt", "end", { system: "you are…" }),
    ev("llm.generate", "start"),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "end", { answer: "Hello." }),
    ev("db.write", "end", { operation: "INSERT" }),
    ev("backend", "end", { answer: "Hello." }),
  ];
}

describe("tourSteps (AC1)", () => {
  it("yields one step per occurring phase, in order, with first-event cursor + station", () => {
    const events = plainRun();
    const steps = tourSteps(events);

    expect(steps.map((s) => s.phase)).toEqual([
      "request",
      "memory",
      "route",
      "retrieve",
      "reason",
      "generate",
      "respond",
      "persist",
    ]);

    const byPhase = Object.fromEntries(steps.map((s) => [s.phase, s]));
    // cursor = the phase's first event; station = STAGE_TO_STATION of that event.
    expect(byPhase.request.cursor).toBe(0);
    expect(byPhase.request.station).toBe("frontend");
    expect(byPhase.memory.station).toBe("database");
    expect(byPhase.route.station).toBe("agent");
    expect(byPhase.retrieve.cursor).toBe(events.findIndex((e) => e.stage === "rag.embed"));
    expect(byPhase.retrieve.station).toBe("rag");
    expect(byPhase.generate.station).toBe("llm");
    expect(byPhase.persist.station).toBe("database");
    // Every step's station agrees with the single source of truth.
    for (const s of steps) {
      expect(s.station).toBe(STAGE_TO_STATION[events[s.cursor].stage]);
    }
  });

  it("beginTour starts playing at the first step; tourStep advances in order", () => {
    const events = plainRun();
    let state = beginTour(events);
    expect(state.status).toBe("playing");
    expect(state.index).toBe(0);
    expect(currentStep(state)?.phase).toBe("request");

    const seen: TimelinePhase[] = [];
    // Drive the reducer until it auto-stops; cap iterations to prove no overrun.
    for (let i = 0; i < 50 && state.status === "playing"; i++) {
      seen.push(currentStep(state)!.phase);
      state = tourStep(state);
    }
    expect(seen).toEqual(tourSteps(events).map((s) => s.phase));
  });
});

// 014-tour-scripted (AC1) — the scripted tour reuses 005's reducer; pin that each
// stop exposes BOTH the cursor (the phase's first event) and the station that owns
// it, since the canvas now leads the eye to that station.
describe("tourSteps station exposure (014 AC1)", () => {
  it("every stop exposes cursor + the station owning the phase's first event", () => {
    const events = plainRun();
    const steps = tourSteps(events);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(typeof s.cursor).toBe("number");
      expect(s.station).toBe(STAGE_TO_STATION[events[s.cursor].stage]);
    }
  });
});

// 014-tour-scripted (AC4) — the balloon shows new, longer scripted narration (one
// "👉 …" line per phase) and the empty-state CTA, both fully bilingual.
describe("tour narration is scripted + bilingual (014 AC4)", () => {
  it("every timeline phase has non-empty narration in every language", () => {
    for (const { code } of LANGS) {
      const narration = tourNarrationFor(code);
      for (const phase of PHASE_ORDER) {
        expect(narration[phase], `${code}/${phase}`).toBeTruthy();
      }
    }
  });

  it("the empty-state CTA exists in every language", () => {
    for (const { code } of LANGS) {
      expect(tourLabelsFor(code).ctaEmpty, code).toBeTruthy();
    }
  });
});

describe("pause / resume / stop (AC3)", () => {
  it("pause freezes advancement; resume continues; stop clears", () => {
    const events = plainRun();
    const playing = beginTour(events);

    const paused = pauseTour(playing);
    expect(paused.status).toBe("paused");
    // A tick while paused is a no-op — same index, still paused.
    const ticked = tourStep(paused);
    expect(ticked).toEqual(paused);

    const resumed = resumeTour(paused);
    expect(resumed.status).toBe("playing");
    expect(tourStep(resumed).index).toBe(playing.index + 1);

    const stopped = stopTour();
    expect(stopped.status).toBe("idle");
    expect(stopped.steps).toEqual([]);
    expect(currentStep(stopped)).toBeNull();
  });
});

describe("auto-stop on the last phase (AC4)", () => {
  it("transitions to done at the end and never overruns", () => {
    const events = plainRun();
    const steps = tourSteps(events);
    const atLast = { steps, index: steps.length - 1, status: "playing" as const };

    const done = tourStep(atLast);
    expect(done.status).toBe("done");
    expect(done.index).toBe(steps.length - 1); // no overrun past the last step
    // Further ticks are inert once done.
    expect(tourStep(done)).toEqual(done);
  });
});

describe("start gating (AC5)", () => {
  it("beginTour with an empty trace yields an idle, stepless tour", () => {
    const idle = beginTour([]);
    expect(idle.status).toBe("idle");
    expect(idle.steps).toEqual([]);
    expect(currentStep(idle)).toBeNull();
  });
});

describe("captions + labels are bilingual (AC2)", () => {
  it("every phase has a non-empty caption in every language", () => {
    for (const { code } of LANGS) {
      const captions = tourCaptionsFor(code);
      for (const phase of PHASE_ORDER) {
        expect(captions[phase], `${code}/${phase}`).toBeTruthy();
      }
    }
  });

  it("the control labels exist in every language", () => {
    for (const { code } of LANGS) {
      const labels = tourLabelsFor(code);
      expect(labels.start).toBeTruthy();
      expect(labels.pause).toBeTruthy();
      expect(labels.resume).toBeTruthy();
      expect(labels.stop).toBeTruthy();
      expect(labels.prev).toBeTruthy(); // 037 — manual step-back control
      expect(labels.next).toBeTruthy(); // 037 — manual step-forward control
    }
  });
});

// 037-first-visit-onboarding — a calmer auto dwell + manual ◀ ▶ stepping that
// pauses the auto-play, so the visitor reads each stop at their own pace.
describe("calmer pacing + manual stepping (037)", () => {
  it("AC5: the auto dwell is calm enough to read (>= 7000 ms)", () => {
    expect(TOUR_PACE_MS).toBeGreaterThanOrEqual(7000);
  });

  it("AC6: tourNext advances one stop and pauses the auto-play", () => {
    const playing = beginTour(plainRun()); // index 0, playing
    const next = tourNext(playing);
    expect(next.index).toBe(1);
    expect(next.status).toBe("paused");
  });

  it("AC6: tourPrev retreats one stop and pauses", () => {
    const atTwo = { ...beginTour(plainRun()), index: 2 };
    const prev = tourPrev(atTwo);
    expect(prev.index).toBe(1);
    expect(prev.status).toBe("paused");
  });

  it("AC6: stepping clamps at both ends (no underflow / overrun)", () => {
    const steps = tourSteps(plainRun());
    const atFirst = { steps, index: 0, status: "paused" as const };
    expect(tourPrev(atFirst).index).toBe(0);

    const atLast = { steps, index: steps.length - 1, status: "playing" as const };
    const clamped = tourNext(atLast);
    expect(clamped.index).toBe(steps.length - 1);
    expect(clamped.status).toBe("paused");
  });

  it("AC6: stepping is inert when the tour is idle or done", () => {
    expect(tourNext(IDLE_TOUR)).toEqual(IDLE_TOUR);
    expect(tourPrev(IDLE_TOUR)).toEqual(IDLE_TOUR);
    const done = { steps: tourSteps(plainRun()), index: 3, status: "done" as const };
    expect(tourNext(done)).toEqual(done);
    expect(tourPrev(done)).toEqual(done);
  });
});

describe("purity + minimal step shape (AC6)", () => {
  it("a step carries only cursor, station and phase", () => {
    const step = tourSteps(plainRun())[0];
    expect(Object.keys(step).sort()).toEqual(["cursor", "phase", "station"]);
  });

  it("the reducer does not mutate its input", () => {
    const events = Object.freeze(plainRun()) as TraceEvent[];
    const state = beginTour(events);
    const frozen: TourStep[] = Object.freeze([...state.steps]) as TourStep[];
    const before = { ...state, steps: frozen };
    // Would throw if the reducer mutated the frozen state/steps in place.
    tourStep(Object.freeze(before) as typeof before);
    expect(state.index).toBe(0);
  });
});
