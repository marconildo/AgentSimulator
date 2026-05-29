// 050-replay-bubble-streaming (AC9) — cancelled-run boundary check: after a
// cancel, loading a DIFFERENT finished trace and replaying it must walk the
// bubble through status → streamed → final cleanly, with no leakage from the
// cancelled run (no stale `view.streaming`, no leftover cursor, no settled
// flag that flips wrong). Pure store-level smoke test — the chat-bubble DOM
// behavior is covered by ChatPanel.replay.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isFlowSettled, replayBubble } from "../lib/chatStatus";
import { deriveView } from "../lib/derive";
import { activePhase } from "../lib/phases";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { useSimulator } from "./useSimulator";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function partialThenCancelled(): TraceEvent[] {
  seq = 0;
  // Trace that never reached `llm.generate` — a typical mid-think cancel.
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("agent.think", "start"),
  ];
}

function finishedRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "other" }),
    ev("backend", "start"),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "start"),
    ev("llm.generate", "progress", { token: "Hi" }),
    ev("llm.generate", "progress", { token: " there." }),
    ev("llm.generate", "end", { answer: "Hi there." }),
    ev("respond", "end", { answer: "Hi there." }),
    ev("backend", "end", { answer: "Hi there." }),
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

describe("050 AC9 — cancel then replay another turn walks cleanly", () => {
  it("loads a different finished trace after cancel and replay-projects from it without leakage", () => {
    // Cancel a partial run.
    useSimulator.getState().beginRun();
    for (const e of partialThenCancelled()) useSimulator.getState().pushTrace(e);
    useSimulator.getState().cancelRun();
    expect(useSimulator.getState().status).toBe("cancelled");

    // Load an unrelated finished trace (= clicking a past message).
    const events = finishedRun();
    useSimulator.getState().loadTrace(events);
    const tail = events.length - 1;

    // Sanity: loadTrace replaces events wholesale and settles at the tail.
    expect(useSimulator.getState().events).toEqual(events);
    expect(useSimulator.getState().cursor).toBe(tail);

    // At the tail with playing=false → settled; projection returns PERSISTED.
    const s = useSimulator.getState();
    const settled = isFlowSettled({
      events: s.events,
      cursor: s.cursor,
      status: s.status,
      playing: s.playing,
    });
    expect(settled).toBe(true);
    const settledBubble = replayBubble(
      deriveView(s.events, s.cursor),
      activePhase(s.events, s.cursor),
      { hasEvents: true, isSettled: true, persistedAnswer: "PERSISTED" },
    );
    expect(settledBubble).toEqual({
      kind: "answer",
      text: "PERSISTED",
      streaming: false,
    });

    // Now scrub the cursor mid-trace (simulates pressing ⏮ / dragging the
    // scrubber). The projection at a `agent.think/end` should be a status
    // bubble; the streamed-token projection at a `llm.generate/progress`
    // should flip to `answer{streaming:true}`. Neither must leak the cancelled
    // run's empty/partial state — `events` is fully replaced by `loadTrace`.
    const thinkEndIdx = events.findIndex(
      (e) => e.stage === "agent.think" && e.phase === "end",
    );
    const firstToken = events.findIndex(
      (e) => e.stage === "llm.generate" && e.phase === "progress",
    );

    useSimulator.setState({ cursor: thinkEndIdx, playing: true, status: "done" });
    const sThink = useSimulator.getState();
    const thinkBubble = replayBubble(
      deriveView(sThink.events, sThink.cursor),
      activePhase(sThink.events, sThink.cursor),
      {
        hasEvents: sThink.events.length > 0,
        isSettled: isFlowSettled({
          events: sThink.events,
          cursor: sThink.cursor,
          status: sThink.status,
          playing: sThink.playing,
        }),
        persistedAnswer: "PERSISTED",
      },
    );
    expect(thinkBubble.kind).toBe("status");
    if (thinkBubble.kind === "status") expect(thinkBubble.phase).toBe("reason");

    useSimulator.setState({ cursor: firstToken });
    const sTok = useSimulator.getState();
    const tokenBubble = replayBubble(
      deriveView(sTok.events, sTok.cursor),
      activePhase(sTok.events, sTok.cursor),
      {
        hasEvents: sTok.events.length > 0,
        isSettled: isFlowSettled({
          events: sTok.events,
          cursor: sTok.cursor,
          status: sTok.status,
          playing: sTok.playing,
        }),
        persistedAnswer: "PERSISTED",
      },
    );
    expect(tokenBubble.kind).toBe("answer");
    if (tokenBubble.kind === "answer") {
      expect(tokenBubble.text.length).toBeGreaterThan(0);
      expect(tokenBubble.streaming).toBe(true);
    }
  });
});
