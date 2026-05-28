// Lazy session creation: clicking "New chat" (or first load with no history)
// must NOT persist a conversation — it only shows an empty *draft* thread. The
// session row is created lazily on the first real action (sending a message or
// uploading a PDF), so bare "New chat" clicks never leave empty conversations
// in the history.

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
import {
  clearDraftPending,
  isDraftPending,
  markDraftPending,
} from "../lib/draftSession";
import * as sse from "../lib/sse";
import { useChat } from "./useChat";
import { useSimulator } from "./useSimulator";

// A stale event from a previous run, used to prove the canvas is wiped when the
// conversation context changes.
const staleEvent: TraceEvent = {
  trace_id: "old",
  seq: 0,
  ts: 0,
  stage: "backend",
  phase: "end",
  label: "",
  data: {},
  metrics: {},
};

const session = (id: string) => ({
  id,
  title: null,
  created_at: 0,
  updated_at: 0,
  message_count: 0,
});

const resetStore = () =>
  useChat.setState({
    view: "thread",
    sessions: [],
    activeSessionId: null,
    messages: [],
    documents: [],
    pending: null,
    input: "",
    loading: false,
    sending: false,
    uploading: false,
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  useSimulator.getState().reset();
  clearDraftPending();
});

describe("useChat — lazy session creation", () => {
  it("newChat opens an empty draft thread without persisting a session", async () => {
    useChat.setState({
      sessions: [session("old")],
      activeSessionId: "old",
      messages: [{ id: "m", message: "hi", answer: "yo", chunks: [], skills: [], created_at: 0 }],
    });

    await useChat.getState().newChat();

    const s = useChat.getState();
    expect(chatApi.createSession).not.toHaveBeenCalled();
    expect(s.activeSessionId).toBeNull();
    expect(s.view).toBe("thread");
    expect(s.messages).toEqual([]);
    // The existing conversation stays in the sidebar history, untouched.
    expect(s.sessions.map((x) => x.id)).toEqual(["old"]);
  });

  it("init with no history does not create a session (shows a draft)", async () => {
    vi.mocked(chatApi.listSessions).mockResolvedValue([]);

    await useChat.getState().init();

    const s = useChat.getState();
    expect(chatApi.createSession).not.toHaveBeenCalled();
    expect(s.activeSessionId).toBeNull();
    expect(s.view).toBe("thread");
  });

  it("init with existing sessions opens the most recent (no new row)", async () => {
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("a"), session("b")]);
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listDocuments).mockResolvedValue([]);

    await useChat.getState().init();

    expect(useChat.getState().activeSessionId).toBe("a");
    expect(chatApi.createSession).not.toHaveBeenCalled();
  });

  it("ensureSession creates and activates a session from a draft", async () => {
    vi.mocked(chatApi.createSession).mockResolvedValue(session("new"));

    const id = await useChat.getState().ensureSession();

    expect(id).toBe("new");
    expect(chatApi.createSession).toHaveBeenCalledOnce();
    const s = useChat.getState();
    expect(s.activeSessionId).toBe("new");
    expect(s.sessions.map((x) => x.id)).toEqual(["new"]);
  });

  it("ensureSession reuses the active session (no extra row)", async () => {
    useChat.setState({ sessions: [session("old")], activeSessionId: "old" });

    const id = await useChat.getState().ensureSession();

    expect(id).toBe("old");
    expect(chatApi.createSession).not.toHaveBeenCalled();
  });

  it("sending the first message in a draft creates the session", async () => {
    vi.mocked(chatApi.createSession).mockResolvedValue(session("created"));
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("created")]);
    // Realistic stream: signal completion so the run settles and send() finishes.
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      handlers.onDone({ trace_id: "t", answer: "", session_id: "created" });
    });
    useChat.setState({ input: "hello", activeSessionId: null });

    await useChat.getState().send();

    expect(chatApi.createSession).toHaveBeenCalledOnce();
    expect(useChat.getState().activeSessionId).toBe("created");
    // The freshly-created session id is the one sent to the backend.
    const call = vi.mocked(sse.streamChat).mock.calls[0];
    expect(call[0]).toBe("hello");
    expect(call[3]).toBe("created");
  });

  it("send(text) sends an explicit suggestion even with an empty input box (§3.10)", async () => {
    vi.mocked(chatApi.createSession).mockResolvedValue(session("created"));
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("created")]);
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      handlers.onDone({ trace_id: "t", answer: "", session_id: "created" });
    });
    // The suggested-question buttons fire send(ex) directly — the input is empty.
    useChat.setState({ input: "", activeSessionId: null });

    await useChat.getState().send("What is RAG?");

    const call = vi.mocked(sse.streamChat).mock.calls[0];
    expect(call[0]).toBe("What is RAG?");
  });

  it("no longer exposes a destructive clear action on the store", () => {
    expect(
      (useChat.getState() as unknown as Record<string, unknown>).clearConversation,
    ).toBeUndefined();
  });
});

// Regression: clicking "New conversation" then refreshing the page used to dump
// the user back into the most recent session because draft state was purely
// in-memory. A tiny localStorage flag survives the reload so init() honors the
// explicit intent to start fresh.
describe("useChat — a refresh in draft state stays in the draft", () => {
  it("newChat marks the draft flag (so a refresh remembers the intent)", async () => {
    await useChat.getState().newChat();
    expect(isDraftPending()).toBe(true);
  });

  it("init with the draft flag set shows a draft, even when sessions exist", async () => {
    markDraftPending();
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("a"), session("b")]);

    await useChat.getState().init();

    const s = useChat.getState();
    expect(s.activeSessionId).toBeNull();
    expect(s.view).toBe("thread");
    expect(s.messages).toEqual([]);
    // listMessages must not be called — we never opened a real session.
    expect(chatApi.listMessages).not.toHaveBeenCalled();
    // The sidebar list is still populated so the user can return to a thread.
    expect(s.sessions.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("opening a session from the sidebar clears the draft flag", async () => {
    markDraftPending();
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listDocuments).mockResolvedValue([]);

    await useChat.getState().openSession("a");

    expect(isDraftPending()).toBe(false);
  });

  it("ensureSession (first send / upload) clears the draft flag", async () => {
    markDraftPending();
    vi.mocked(chatApi.createSession).mockResolvedValue(session("created"));

    await useChat.getState().ensureSession();

    expect(isDraftPending()).toBe(false);
  });
});

// Switching the conversation context must wipe the visualizer — otherwise the
// canvas keeps animating the previous run's trace under a brand-new chat.
describe("useChat — resets the canvas on context switch", () => {
  it("newChat wipes the simulator's trace", async () => {
    useSimulator.setState({ events: [staleEvent], cursor: 0, status: "done" });

    await useChat.getState().newChat();

    const sim = useSimulator.getState();
    expect(sim.events).toEqual([]);
    expect(sim.cursor).toBe(-1);
    expect(sim.status).toBe("idle");
  });

  it("openSession wipes the previous run's trace", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listDocuments).mockResolvedValue([]);
    useSimulator.setState({ events: [staleEvent], cursor: 0, status: "done" });

    await useChat.getState().openSession("some-session");

    const sim = useSimulator.getState();
    expect(sim.events).toEqual([]);
    expect(sim.cursor).toBe(-1);
    expect(sim.status).toBe("idle");
  });
});

// 012-chat-flow-sync: the persisted answer must not replace the live bubble while
// the paced playhead is still walking the stations. send() fetches the persisted
// thread as soon as the network finishes, but holds the swap until the flow has
// SETTLED (run over + playhead drained to the tail).
describe("useChat — chat stays in lockstep with the paced flow", () => {
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

  it("holds the persisted swap until the flow settles", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([
      { id: "m", message: "hi", answer: "Hello.", chunks: [], skills: [], created_at: 1 },
    ]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("s")]);
    // The stream resolves on the network WITHOUT calling onDone, so the run is
    // still "streaming" (not settled) when send() reaches the swap gate.
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      handlers.onTrace(trace("frontend", "end"));
      handlers.onTrace(trace("backend", "start"));
    });
    useChat.setState({ input: "hi", activeSessionId: "s" });

    const p = useChat.getState().send();
    // Wait until the network round-trip + persisted fetch have happened.
    await vi.waitFor(() => expect(chatApi.listMessages).toHaveBeenCalled());

    // Flow not settled yet → the live bubble stays, persisted messages unapplied.
    expect(useChat.getState().pending).toBe("hi");
    expect(useChat.getState().messages).toEqual([]);

    // Drain the flow: run finished and the playhead reaches the tail.
    const evs = useSimulator.getState().events;
    useSimulator.setState({
      status: "done",
      playing: false,
      following: true,
      cursor: evs.length - 1,
    });

    await p;
    expect(useChat.getState().pending).toBeNull();
    expect(useChat.getState().messages).toHaveLength(1);
  });
});
