// 009-live-pacing — the pure pacing reducer. The store drives it with a timer;
// here we pin the projection-over-time decision synchronously (no wall clock):
// structural stage changes get a minimum on-screen dwell, token events flush at
// arrival speed, and the streamed answer can never appear before the flow reaches
// the LLM.

import { describe, expect, it } from "vitest";

import { deriveView } from "./derive";
import { dwellFor, isFastForward, LIVE_STEP_MS, paceAdvance } from "./pacing";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function structuralRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "end", { decision: "answer" }),
  ];
}

describe("paceAdvance — AC1 paced, no skipping", () => {
  it("advances one structural event per LIVE_STEP_MS, visiting every index in order", () => {
    const events = structuralRun();
    let cursor = -1;
    let at = 0;
    const seen: number[] = [];
    for (let now = LIVE_STEP_MS; cursor < events.length - 1; now += LIVE_STEP_MS) {
      const r = paceAdvance(events, cursor, at, now);
      expect(r.cursor - cursor).toBeLessThanOrEqual(1); // never jumps to the tail
      cursor = r.cursor;
      at = r.advancedAt;
      seen.push(cursor);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("does not advance before the dwell has elapsed", () => {
    const events = structuralRun();
    const r = paceAdvance(events, -1, 0, LIVE_STEP_MS - 1);
    expect(r.cursor).toBe(-1);
  });
});

describe("paceAdvance — AC2 tokens flush at arrival speed", () => {
  it("flushes a run of token events in a single step, with no dwell", () => {
    seq = 0;
    const events = [
      ev("llm.generate", "start"),
      ev("llm.generate", "progress", { token: "He" }),
      ev("llm.generate", "progress", { token: "llo" }),
      ev("llm.generate", "progress", { token: "." }),
      ev("llm.generate", "end", { answer: "Hello." }),
    ];
    // Cursor sits on llm.generate/start; dwell NOT elapsed (now === at).
    const r = paceAdvance(events, 0, 1000, 1000);
    expect(r.cursor).toBe(3); // flushed all 3 tokens, stopped before the structural end
    expect(isFastForward(events[1])).toBe(true);
    expect(isFastForward(events[0])).toBe(false);
  });
});

describe("persistence dwell (032-network-boundary AC4)", () => {
  it("gives db.write a longer dwell than a regular structural step", () => {
    expect(dwellFor(ev("db.write", "end"))).toBeGreaterThan(LIVE_STEP_MS);
    expect(dwellFor(ev("respond", "end"))).toBe(LIVE_STEP_MS);
  });

  it("holds the playhead on db.write until its longer dwell elapses", () => {
    seq = 0;
    const events = [
      ev("respond", "end", { answer: "x" }),
      ev("db.write", "end", { operation: "INSERT" }),
      ev("backend", "end", { answer: "x" }),
    ];
    // Cursor parked on db.write (index 1). A normal step's worth of time is not
    // enough — the persist must linger.
    const before = paceAdvance(events, 1, 1000, 1000 + LIVE_STEP_MS);
    expect(before.cursor).toBe(1);
    // Once the longer persist dwell elapses, it advances toward the close.
    const after = paceAdvance(events, 1, 1000, 1000 + dwellFor(events[1]));
    expect(after.cursor).toBe(2);
  });
});

describe("paceAdvance — AC3 the answer never pre-empts the flow", () => {
  it("keeps answer empty until the playhead reaches the llm station", () => {
    seq = 0;
    const events = [
      ev("frontend", "end", { message: "hi" }),
      ev("backend", "start"),
      ev("db.read", "end", { recent: [] }),
      ev("agent.route", "end", { query: "hi" }),
      ev("rag.retrieve", "end", { chunks: [] }),
      ev("agent.think", "end", { decision: "answer" }),
      ev("llm.prompt", "end", { system: "…" }),
      ev("llm.generate", "start"),
      ev("llm.generate", "progress", { token: "Hi" }),
      ev("llm.generate", "end", { answer: "Hi" }),
      ev("respond", "end", { answer: "Hi" }),
      ev("backend", "end", { answer: "Hi" }),
    ];
    const firstAnswerIdx = events.findIndex(
      (e) => e.stage === "llm.generate" && (e.phase === "progress" || e.phase === "end"),
    );
    let cursor = -1;
    let at = 0;
    for (let now = LIVE_STEP_MS; cursor < events.length - 1; now += LIVE_STEP_MS) {
      const r = paceAdvance(events, cursor, at, now);
      cursor = r.cursor;
      at = r.advancedAt;
      if (cursor < firstAnswerIdx) expect(deriveView(events, cursor).answer).toBe("");
    }
  });
});
