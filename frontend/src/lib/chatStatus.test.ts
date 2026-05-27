// 012-chat-flow-sync — the chat bubble is a pure projection of the *paced* view,
// just like the canvas: a live execution status while the flow runs, then the
// answer (word-by-word in stream, whole in batch), and the persisted message is
// only revealed once the flow has SETTLED. These tests pin the two pure helpers
// that carry that logic so the chat can never jump ahead of the playhead again.

import { describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { pendingBubble, isFlowSettled } from "./chatStatus";
import { deriveView } from "./derive";
import { activePhase, PHASE_ORDER } from "./phases";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// A streaming run: tokens arrive on llm.generate/progress, answer reassembles.
function streamRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "start"),
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

// A batch run: NO token progress — the whole answer lands on the generate END.
function batchRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "end", { answer: "Whole answer." }),
    ev("respond", "end", { answer: "Whole answer." }),
    ev("backend", "end", { answer: "Whole answer.", delivery: "batch" }),
  ];
}

const bubbleAt = (events: TraceEvent[], cursor: number) =>
  pendingBubble(deriveView(events, cursor), activePhase(events, cursor));

describe("pendingBubble — status until the answer (AC1)", () => {
  it("shows the current timeline phase as a status while the answer is empty", () => {
    const events = streamRun();
    const at = events.findIndex((e) => e.stage === "rag.retrieve");
    const bubble = bubbleAt(events, at);

    expect(bubble.kind).toBe("status");
    if (bubble.kind === "status") expect(bubble.phase).toBe("retrieve");
  });

  it("switches to the answer once the derived answer is non-empty", () => {
    const events = streamRun();
    const at = events.findIndex((e) => e.stage === "llm.generate" && e.phase === "progress");
    const bubble = bubbleAt(events, at);

    expect(bubble.kind).toBe("answer");
    if (bubble.kind === "answer") {
      expect(bubble.text.length).toBeGreaterThan(0);
      expect(bubble.streaming).toBe(true);
    }
  });
});

describe("pendingBubble — answer never pre-empts the flow, stream (AC3)", () => {
  it("is a status at every pre-LLM cursor, an answer only once tokens arrive", () => {
    const events = streamRun();
    const firstToken = events.findIndex(
      (e) => e.stage === "llm.generate" && e.phase === "progress",
    );

    for (let c = 0; c < firstToken; c++) {
      const view = deriveView(events, c);
      // Before any token, the derived answer is empty → the bubble must be status.
      expect(view.answer).toBe("");
      expect(bubbleAt(events, c).kind).toBe("status");
    }
    // From the first token onward the answer is present → bubble is answer.
    expect(bubbleAt(events, firstToken).kind).toBe("answer");
  });
});

describe("pendingBubble — batch reveals the whole answer at the stage (AC4)", () => {
  it("is a status before the answer END and the whole answer at/after it", () => {
    const events = batchRun();
    const answerEnd = events.findIndex((e) => e.stage === "llm.generate" && e.phase === "end");

    for (let c = 0; c < answerEnd; c++) {
      expect(bubbleAt(events, c).kind).toBe("status");
    }
    const bubble = bubbleAt(events, answerEnd);
    expect(bubble.kind).toBe("answer");
    if (bubble.kind === "answer") expect(bubble.text).toBe("Whole answer.");
  });
});

describe("chat.stage running labels are bilingual (AC2)", () => {
  it("every timeline phase has a non-blank en + pt label", () => {
    const en = UI.en.chat.stage;
    const pt = UI.pt.chat.stage;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const phase of PHASE_ORDER) {
      expect(en[phase]?.trim().length ?? 0).toBeGreaterThan(0);
      expect(pt[phase]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("isFlowSettled — gate for revealing the persisted message (AC5)", () => {
  const events = streamRun();
  const tail = events.length - 1;

  it("is false with no events", () => {
    expect(isFlowSettled({ events: [], cursor: -1, status: "done", playing: false })).toBe(false);
  });

  it("is false while the run is still streaming", () => {
    expect(isFlowSettled({ events, cursor: tail, status: "streaming", playing: false })).toBe(
      false,
    );
  });

  it("is false while a replay is playing", () => {
    expect(isFlowSettled({ events, cursor: tail, status: "done", playing: true })).toBe(false);
  });

  it("is false while the playhead has not drained to the tail", () => {
    expect(isFlowSettled({ events, cursor: tail - 3, status: "done", playing: false })).toBe(
      false,
    );
  });

  it("is true once the run is over, not replaying, and drained to the tail", () => {
    expect(isFlowSettled({ events, cursor: tail, status: "done", playing: false })).toBe(true);
  });
});
