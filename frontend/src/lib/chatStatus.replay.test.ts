// 050-replay-bubble-streaming — the replay-aware projection that drives the
// chat bubble of the *loaded* (persisted) turn while the simulator's cursor
// walks through its trace, mirroring the live `pendingBubble` projection so
// step/replay teaches the same "Reasoning… → tokens type out → final answer"
// story a live send does.
//
// `replayBubble` is the pure helper: at the tail of a finished run (or when
// there are no events to project from), it returns the PERSISTED answer
// verbatim (byte-for-byte parity with today's settled frame); otherwise it
// delegates to `pendingBubble(view, phase)` so the same status/answer
// rendering used live can be reused inside `Exchange`.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { isFlowSettled, replayBubble } from "./chatStatus";
import { deriveView } from "./derive";
import { activePhase } from "./phases";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// Same streaming-run shape as chatStatus.test.ts — token progress on
// llm.generate is what `view.answer` reassembles from.
function streamRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.embed", "start"),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "start"),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "start"),
    ev("llm.generate", "progress", { token: "Hel" }),
    ev("llm.generate", "progress", { token: "lo." }),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "end", { answer: "Hello." }),
    ev("db.write", "end", { operation: "INSERT", total_rows: 1 }),
    ev("backend", "end", { answer: "Hello.", delivery: "stream" }),
  ];
}

const callAt = (events: TraceEvent[], cursor: number, persistedAnswer: string, isSettled: boolean) =>
  replayBubble(deriveView(events, cursor), activePhase(events, cursor), {
    hasEvents: events.length > 0,
    isSettled,
    persistedAnswer,
  });

describe("replayBubble — status while view.answer is empty (AC1)", () => {
  it("renders a status (typing-dots) while the cursor has not reached any token", () => {
    const events = streamRun();
    // Cursor sits at agent.think/end — no llm.generate progress yet.
    const at = events.findIndex((e) => e.stage === "agent.think" && e.phase === "end");
    const bubble = callAt(events, at, "Hello.", false);

    expect(bubble.kind).toBe("status");
    if (bubble.kind === "status") expect(bubble.phase).toBe("reason");
  });
});

describe("replayBubble — empty events fall back to the persisted answer (AC8)", () => {
  it("returns the persisted answer when there are no events to project from", () => {
    // No events to drive the projection — the only honest thing to render is
    // the persisted answer (e.g. trace expired, never loaded yet).
    const bubble = replayBubble(deriveView([], -1), activePhase([], -1), {
      hasEvents: false,
      isSettled: false,
      persistedAnswer: "final answer",
    });

    expect(bubble).toEqual({ kind: "answer", text: "final answer", streaming: false });
  });
});

describe("replayBubble — settled tail picks PERSISTED, not reassembled (AC4 / projection)", () => {
  it("returns the persisted answer (verbatim) when the simulator has settled at the tail", () => {
    const events = streamRun();
    const tail = events.length - 1;
    const settled = isFlowSettled({ events, cursor: tail, status: "done", playing: false });
    expect(settled).toBe(true); // sanity

    // Even though view.answer reassembles to "Hello." too, the helper MUST
    // return the persisted text — byte-for-byte parity with today's settled
    // frame is the contract (no token-reassembly drift, no flicker).
    const bubble = callAt(events, tail, "PERSISTED — different on purpose", settled);

    expect(bubble.kind).toBe("answer");
    if (bubble.kind === "answer") {
      expect(bubble.text).toBe("PERSISTED — different on purpose");
      expect(bubble.streaming).toBe(false);
    }
  });
});

describe("replayBubble — stepped cursor walks status → partial → final monotonically (AC10)", () => {
  it("walks status* → answer{streaming:true}+ → answer{streaming:false} as the cursor advances", () => {
    const events = streamRun();
    const tail = events.length - 1;
    type Phase = "status" | "answer-streaming" | "answer-final";
    const observed: Phase[] = [];

    for (let c = -1; c <= tail; c++) {
      const settled = isFlowSettled({ events, cursor: c, status: "done", playing: false });
      const bubble = callAt(events, c, "Hello.", settled);
      observed.push(
        bubble.kind === "status"
          ? "status"
          : bubble.streaming
            ? "answer-streaming"
            : "answer-final",
      );
    }

    // Must START with status (no answer yet at cursor -1).
    expect(observed[0]).toBe("status");
    // Must END with answer-final (settled tail returns persisted, streaming:false).
    expect(observed[observed.length - 1]).toBe("answer-final");
    // At least one status frame AND at least one streaming frame appear.
    expect(observed).toContain("status");
    expect(observed).toContain("answer-streaming");

    // Monotone: once we leave `status`, we never go back to it.
    const firstNonStatus = observed.findIndex((p) => p !== "status");
    expect(firstNonStatus).toBeGreaterThan(0);
    for (let i = firstNonStatus; i < observed.length; i++) {
      expect(observed[i]).not.toBe("status");
    }
    // Monotone: once we leave `answer-streaming` for `answer-final`, we never
    // go back to streaming. (Settled tail is the only place final lands here.)
    const firstFinal = observed.indexOf("answer-final");
    if (firstFinal !== -1) {
      for (let i = firstFinal; i < observed.length; i++) {
        expect(observed[i]).toBe("answer-final");
      }
    }
  });
});
