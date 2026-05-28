// 022-message-trace-link (T5) — re-opening a conversation must not leave the
// canvas dead: `openSession` auto-loads the latest turn's trace via the memoized
// loader (AC2). Clicking a past message (`selectMessage`) loads that turn (AC1).
// An evicted latest trace flips `traceExpired` (the click-to-load hint) instead
// of crashing, and the canvas stays empty (AC2/expired).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  clearData: vi.fn(),
  createSession: vi.fn(),
  deleteDocument: vi.fn(),
  listDocuments: vi.fn(),
  listMessages: vi.fn(),
  listSessions: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock("../lib/traceCache", () => ({ loadTrace: vi.fn() }));

import type { Stage, TraceEvent } from "../types/events";
import * as chatApi from "../lib/chatApi";
import * as traceCache from "../lib/traceCache";
import { useChat } from "./useChat";
import { useSimulator } from "./useSimulator";

let seq = 0;
const evt = (stage: Stage): TraceEvent => ({
  trace_id: "t",
  seq: seq++,
  ts: 0,
  stage,
  phase: "end",
  label: "",
  data: {},
  metrics: {},
});

const msg = (id: string, createdAt: number) => ({
  id,
  message: "q",
  answer: "a",
  chunks: [],
  skills: [],
  documents: [],
  created_at: createdAt,
});

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  useSimulator.getState().reset();
  vi.mocked(chatApi.listDocuments).mockResolvedValue([]);
});

describe("useChat — 022 revisit a turn's trace", () => {
  it("AC2 — openSession auto-loads the latest turn's trace (canvas not dead)", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([msg("m1", 1), msg("m2", 2)]);
    const events = [evt("frontend"), evt("backend")];
    vi.mocked(traceCache.loadTrace).mockResolvedValue({ ok: true, events });

    await useChat.getState().openSession("s");

    // The newest message (highest created_at, listed last) drives the load.
    expect(traceCache.loadTrace).toHaveBeenCalledWith("m2");
    const sim = useSimulator.getState();
    expect(sim.events).toEqual(events);
    expect(sim.cursor).toBe(events.length - 1);
    expect(sim.status).toBe("done");
    expect(useChat.getState().traceExpired).toBe(false);
    expect(useChat.getState().loadedTraceId).toBe("m2");
  });

  it("AC2 — an evicted latest trace sets traceExpired, no crash, canvas stays empty", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([msg("m1", 1)]);
    vi.mocked(traceCache.loadTrace).mockResolvedValue({ ok: false, expired: true });

    await useChat.getState().openSession("s");

    expect(useChat.getState().traceExpired).toBe(true);
    expect(useChat.getState().loadedTraceId).toBeNull();
    // reset() left the canvas empty; the expired load didn't populate it.
    expect(useSimulator.getState().events).toEqual([]);
  });

  it("AC2 — a conversation with no prior turns leaves no expired flag (clean draft)", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);

    await useChat.getState().openSession("s");

    expect(traceCache.loadTrace).not.toHaveBeenCalled();
    expect(useChat.getState().traceExpired).toBe(false);
    expect(useSimulator.getState().events).toEqual([]);
  });

  it("AC1 — selectMessage loads that turn's trace onto the canvas", async () => {
    const events = [evt("agent.think"), evt("respond"), evt("backend")];
    vi.mocked(traceCache.loadTrace).mockResolvedValue({ ok: true, events });

    await useChat.getState().selectMessage("m9");

    expect(traceCache.loadTrace).toHaveBeenCalledWith("m9");
    const sim = useSimulator.getState();
    expect(sim.events).toEqual(events);
    expect(sim.cursor).toBe(2);
    expect(useChat.getState().loadedTraceId).toBe("m9");
  });

  it("AC2 — selecting an expired turn sets traceExpired without clobbering the canvas", async () => {
    // A trace is already loaded; selecting an expired turn should not wipe it.
    const loaded = [evt("backend")];
    useSimulator.getState().loadTrace(loaded);
    vi.mocked(traceCache.loadTrace).mockResolvedValue({ ok: false, expired: true });

    await useChat.getState().selectMessage("gone");

    expect(useChat.getState().traceExpired).toBe(true);
    expect(useSimulator.getState().events).toEqual(loaded);
  });
});
