// 016-cancel-stream (AC1, AC2) — cancelling an in-flight chat run settles the
// store into a clean, non-error terminal state: it aborts the run's signal,
// drops the optimistic `pending` bubble, flips `sending → false` and raises a
// transient `cancelled` flag — never throwing, never reloading the discarded
// turn. It is a no-op when no run is active, and the flag clears on the next send.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteDocument: vi.fn(),
  listSessions: vi.fn(),
  listMessages: vi.fn(),
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock("../lib/sse", () => ({
  API_BASE: "",
  consumeEventStream: vi.fn(),
  streamChat: vi.fn(),
  batchChat: vi.fn(),
}));

import type { TraceEvent } from "../types/events";
import * as chatApi from "../lib/chatApi";
import * as sse from "../lib/sse";
import { useChat } from "./useChat";
import { useSimulator } from "./useSimulator";

const session = (id: string) => ({
  id,
  title: null,
  created_at: 0,
  updated_at: 0,
  message_count: 0,
});

const trace = (stage: TraceEvent["stage"], phase: TraceEvent["phase"]): TraceEvent => ({
  trace_id: "t",
  seq: 0,
  ts: 0,
  stage,
  phase,
  label: "",
  data: {},
  metrics: {},
});

const resetStore = () =>
  useChat.setState({
    view: "thread",
    sessions: [],
    activeSessionId: null,
    messages: [],
    pendingDocuments: [],
    pendingAttachments: [],
    pending: null,
    input: "",
    loading: false,
    sending: false,
    uploading: false,
    cancelled: false,
    error: null,
  });

// A run that streams two trace events then hangs until the signal aborts — when
// it does, it rejects with an AbortError, exactly like fetch() does on abort.
function streamUntilAborted() {
  vi.mocked(sse.streamChat).mockImplementation((_m, handlers, signal) => {
    handlers.onTrace(trace("frontend", "end"));
    handlers.onTrace(trace("backend", "start"));
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        const err = new Error("The user aborted a request.");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  useSimulator.getState().reset();
});

describe("useChat — cancel an in-flight run (016-cancel-stream)", () => {
  it("AC1 — cancel is a no-op when no run is active", () => {
    useChat.getState().cancel();
    expect(useChat.getState().cancelled).toBe(false);
    expect(useChat.getState().sending).toBe(false);
    expect(useSimulator.getState().status).toBe("idle");
  });

  it("AC2 — cancel aborts the run, settles to a non-error cancelled state", async () => {
    streamUntilAborted();
    useChat.setState({ input: "hi", activeSessionId: "s" });

    const p = useChat.getState().send();
    await vi.waitFor(() => expect(useChat.getState().sending).toBe(true));
    // The optimistic bubble + a partial trace are in flight.
    expect(useChat.getState().pending).toBe("hi");
    expect(useSimulator.getState().events.length).toBe(2);

    useChat.getState().cancel();

    const c = useChat.getState();
    expect(c.sending).toBe(false);
    expect(c.cancelled).toBe(true);
    expect(c.pending).toBeNull();
    expect(c.error).toBeNull(); // cancel is NOT an error
    // The run is marked cancelled but its partial trace stays on the canvas (AC3).
    expect(useSimulator.getState().status).toBe("cancelled");
    expect(useSimulator.getState().events.length).toBe(2);

    // send() unwinds cleanly (no throw) and never reloads the discarded turn.
    await expect(p).resolves.toBeUndefined();
    expect(chatApi.listMessages).not.toHaveBeenCalled();
    expect(useChat.getState().messages).toEqual([]);
    expect(useChat.getState().sending).toBe(false);
  });

  it("clears the cancelled flag when a fresh run starts", async () => {
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      handlers.onDone({ trace_id: "t", answer: "", session_id: "s" });
    });
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("s")]);
    useChat.setState({ cancelled: true, input: "hi", activeSessionId: "s" });

    await useChat.getState().send();

    expect(useChat.getState().cancelled).toBe(false);
  });

  it("clears the cancelled flag when opening another conversation", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listDocuments).mockResolvedValue([]);
    useChat.setState({ cancelled: true });

    await useChat.getState().openSession("other");

    expect(useChat.getState().cancelled).toBe(false);
  });

  it("clears the cancelled flag on newChat", async () => {
    useChat.setState({ cancelled: true });

    await useChat.getState().newChat();

    expect(useChat.getState().cancelled).toBe(false);
  });
});
