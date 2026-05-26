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
});

describe("useChat — lazy session creation", () => {
  it("newChat opens an empty draft thread without persisting a session", async () => {
    useChat.setState({
      sessions: [session("old")],
      activeSessionId: "old",
      messages: [{ id: "m", message: "hi", answer: "yo", chunks: [], created_at: 0 }],
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
    vi.mocked(sse.streamChat).mockResolvedValue(undefined);
    useChat.setState({ input: "hello", activeSessionId: null });

    await useChat.getState().send();

    expect(chatApi.createSession).toHaveBeenCalledOnce();
    expect(useChat.getState().activeSessionId).toBe("created");
    // The freshly-created session id is the one sent to the backend.
    const call = vi.mocked(sse.streamChat).mock.calls[0];
    expect(call[0]).toBe("hello");
    expect(call[3]).toBe("created");
  });

  it("no longer exposes a destructive clear action on the store", () => {
    expect(
      (useChat.getState() as unknown as Record<string, unknown>).clearConversation,
    ).toBeUndefined();
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
