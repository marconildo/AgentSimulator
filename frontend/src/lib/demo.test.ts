// 058-online-demo-mode — the backend-less showcase build. These tests exercise
// the demo module directly (offline, no key): the flag default, the captured-trace
// selection (incl. the Intermediate rerank difference + graceful fallback), the
// in-memory catalog reads, and a full demo send turn.

import { describe, expect, it } from "vitest";

import { STAGE_TO_STATION } from "./stations";
import {
  demoBatchChat,
  demoCreateSession,
  demoGetConfig,
  demoHealth,
  demoListAgents,
  demoListDocuments,
  demoListMessages,
  demoListSessions,
  demoListSkills,
  demoStreamChat,
  isDemo,
  qidForMessage,
  selectDemoTrace,
  DEMO_QUESTIONS,
} from "./demo";
import type { DoneEvent, TraceEvent } from "../types/events";

describe("demo flag (AC1)", () => {
  it("isDemo() is false in a normal (non-demo) build", () => {
    // Vitest runs without VITE_DEMO_MODE set, mirroring the local build.
    expect(isDemo()).toBe(false);
  });
});

describe("demoHealth (AC2)", () => {
  it("reports a healthy, keyed OpenAI model so no offline/no-key banner shows", () => {
    const h = demoHealth();
    expect(h.status).toBe("ok");
    expect(h.hasKey).toBe(true);
    expect(typeof h.llmModel).toBe("string");
    expect((h.llmModel as string).length).toBeGreaterThan(0);
  });
});

describe("demo catalog reads (AC3)", () => {
  it("resolve from fixtures + the in-memory store without a backend", async () => {
    const config = await demoGetConfig();
    expect(config.tools.length).toBeGreaterThan(0);
    expect(config.scenarios.length).toBeGreaterThan(0);

    const agents = await demoListAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].is_default).toBe(true);

    expect(await demoListSkills()).toEqual([]);
    expect(await demoListDocuments()).toEqual([]);

    const session = await demoCreateSession();
    const sessions = await demoListSessions();
    expect(sessions.some((s) => s.id === session.id)).toBe(true);
    // A brand-new session has no messages yet.
    expect(await demoListMessages(session.id)).toEqual([]);
  });
});

describe("selectDemoTrace (AC4)", () => {
  it("returns real captures whose stages all map to a station", () => {
    const trace = selectDemoTrace("rag", "simple", "en");
    expect(trace.events.length).toBeGreaterThan(0);
    for (const ev of trace.events as TraceEvent[]) {
      expect(STAGE_TO_STATION[ev.stage]).toBeDefined();
    }
  });

  it("Intermediate RAG adds rag.rerank that Simple does not have", () => {
    const stages = (t: { events: TraceEvent[] }) => new Set(t.events.map((e) => e.stage));
    const simple = stages(selectDemoTrace("rag", "simple", "en"));
    const intermediate = stages(selectDemoTrace("rag", "intermediate", "en"));
    expect(simple.has("rag.rerank")).toBe(false);
    expect(intermediate.has("rag.rerank")).toBe(true);
  });

  it("RAGLESS replays the reasoning-based PageIndex path, not the vector pipeline", () => {
    const stages = (t: { events: TraceEvent[] }) => new Set(t.events.map((e) => e.stage));
    const ragless = stages(selectDemoTrace("rag", "ragless", "en"));
    // The RAGLESS capture runs PageIndex (tree → navigate → select) …
    expect(ragless.has("pageindex.select")).toBe(true);
    expect(ragless.has("pageindex.navigate")).toBe(true);
    // … and skips the vector path entirely (066 mutually-exclusive radio).
    expect(ragless.has("rag.retrieve")).toBe(false);
    expect(ragless.has("rag.rerank")).toBe(false);
  });

  it("maps every curated question label back to its id", () => {
    for (const q of DEMO_QUESTIONS) {
      expect(qidForMessage(q.label.en)).toBe(q.id);
      expect(qidForMessage(q.label.pt)).toBe(q.id);
    }
  });
});

describe("selectDemoTrace fallback (AC6)", () => {
  it("never throws for an unknown question / scenario / language", () => {
    expect(() => selectDemoTrace(null, "advanced", "zz")).not.toThrow();
    const t = selectDemoTrace("does-not-exist", "nope", "zz");
    expect(t.events.length).toBeGreaterThan(0);
  });
});

describe("demo send turn (AC5)", () => {
  it("stream mode appends a message whose id === trace_id and settles the answer", async () => {
    const session = await demoCreateSession();
    const events: TraceEvent[] = [];
    let done: DoneEvent | null = null;
    await demoStreamChat(
      DEMO_QUESTIONS[0].label.en,
      { onTrace: (e) => events.push(e), onDone: (d) => (done = d) },
      undefined,
      session.id,
    );
    expect(events.length).toBeGreaterThan(0);
    expect(done).not.toBeNull();

    const messages = await demoListMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(done!.trace_id);
    expect(messages[0].answer.length).toBeGreaterThan(0);
    // Every emitted event is tagged with the fresh per-turn trace id (no collision
    // with the captured fixture's original id across repeated sends).
    expect(events.every((e) => e.trace_id === messages[0].id)).toBe(true);
  });

  it("batch mode hands back the whole captured trace", async () => {
    const session = await demoCreateSession();
    const summary = await demoBatchChat(DEMO_QUESTIONS[1].label.en, session.id);
    expect(summary.events.length).toBeGreaterThan(0);
    expect(summary.answer.length).toBeGreaterThan(0);
    const messages = await demoListMessages(session.id);
    expect(messages.some((m) => m.id === summary.trace_id)).toBe(true);
  });

  it("persists the retrieved RAG chunks with the message so 'Sources used' renders", async () => {
    // Regression: demo turns used to hardcode chunks: [], so the "Sources used"
    // section under a RAG answer never appeared (it gates on chunks.length > 0).
    // The chunks must be reconstructed from the captured rag.retrieve event.
    const session = await demoCreateSession();
    await demoBatchChat(DEMO_QUESTIONS[0].label.en, session.id); // the RAG question
    const messages = await demoListMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].chunks.length).toBeGreaterThan(0);
    expect(messages[0].chunks[0].source.length).toBeGreaterThan(0);
    expect(messages[0].chunks[0].text.length).toBeGreaterThan(0);
  });
});
