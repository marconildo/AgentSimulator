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
  listAgents: vi.fn(),
  setSessionAgent: vi.fn(),
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
    pendingDocuments: [],
    pending: null,
    input: "",
    loading: false,
    sending: false,
    uploading: false,
    error: null,
    // 045 draft fix: reset between tests so a previously-seeded BOB doesn't
    // bleed into a test that expects the default-linked agent (null).
    draftAgent: null,
  });

const docMeta = (document_id: string, filename = `${document_id}.pdf`) => ({
  document_id,
  filename,
  chunk_count: 3,
  created_at: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  useSimulator.getState().reset();
  clearDraftPending();
  // Quiet default for the catalog prefetch — most tests don't care about the
  // draft chip, and the helper is wrapped in try/catch anyway.
  vi.mocked(chatApi.listAgents).mockResolvedValue([]);
});

describe("useChat — lazy session creation", () => {
  it("newChat opens an empty draft thread without persisting a session", async () => {
    useChat.setState({
      sessions: [session("old")],
      activeSessionId: "old",
      messages: [
        {
          id: "m",
          message: "hi",
          answer: "yo",
          chunks: [],
          skills: [],
          documents: [],
          created_at: 0,
        },
      ],
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

  // 045 draft fix: a non-default draftAgent picked on the chip before any send
  // must be applied to the session ensureSession just created — otherwise the
  // very first turn runs against the catalog default the backend wired up.
  it("ensureSession patches the freshly-created session to the draft agent", async () => {
    const ALICE = {
      id: "a1",
      name: "Alice",
      description: "",
      system_prompt: "g",
      agent_prompt: "a",
      model: "gpt-4o-mini",
      enabled_tools: [],
      is_default: true,
      created_at: 0,
      updated_at: 0,
    };
    const BOB = { ...ALICE, id: "a2", name: "Bob", is_default: false };
    vi.mocked(chatApi.createSession).mockResolvedValue({ ...session("new"), agent: ALICE });
    vi.mocked(chatApi.setSessionAgent).mockResolvedValue({ ...session("new"), agent: BOB });
    useChat.setState({ draftAgent: BOB, activeSessionId: null, sessions: [] });

    const id = await useChat.getState().ensureSession();

    expect(id).toBe("new");
    expect(chatApi.setSessionAgent).toHaveBeenCalledWith("new", "a2");
    expect(useChat.getState().sessions[0].agent?.id).toBe("a2");
  });

  it("ensureSession skips the patch when draftAgent already matches the created session", async () => {
    const ALICE = {
      id: "a1",
      name: "Alice",
      description: "",
      system_prompt: "g",
      agent_prompt: "a",
      model: "gpt-4o-mini",
      enabled_tools: [],
      is_default: true,
      created_at: 0,
      updated_at: 0,
    };
    vi.mocked(chatApi.createSession).mockResolvedValue({ ...session("new"), agent: ALICE });
    useChat.setState({ draftAgent: ALICE, activeSessionId: null, sessions: [] });

    await useChat.getState().ensureSession();

    expect(chatApi.setSessionAgent).not.toHaveBeenCalled();
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
      {
        id: "m",
        message: "hi",
        answer: "Hello.",
        chunks: [],
        skills: [],
        documents: [],
        created_at: 1,
      },
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

// 050-replay-bubble-streaming regression: when a NEW send begins, the previously
// loaded turn must stop being "the loaded trace" — otherwise its persisted
// bubble flips into the replay branch and re-projects the *new* turn's streaming
// events (so the old bubble visibly mirrors the live one, "duplicando o
// thinking"). `send()` clears `loadedTraceId` at run start, then re-sets it to
// the just-persisted turn's id once the flow settles.
describe("useChat — sending a new message clears the loaded-trace marker", () => {
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

  it("clears loadedTraceId as soon as the new run starts streaming", async () => {
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("s")]);
    // Stream is in flight; onDone is NOT called so the run stays "streaming".
    let releaseStream: () => void = () => {};
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      handlers.onTrace(trace("frontend", "end"));
      await streamGate;
    });
    useChat.setState({
      input: "second turn",
      activeSessionId: "s",
      // A previous turn was loaded onto the canvas before this new send.
      loadedTraceId: "m-prev",
    });

    const p = useChat.getState().send();

    // The instant streamChat is called, the previous turn must no longer be
    // flagged as the loaded trace — the canvas is now showing the new run.
    await vi.waitFor(() => expect(sse.streamChat).toHaveBeenCalled());
    expect(useChat.getState().loadedTraceId).toBeNull();

    // Drain so send() can settle (no persisted message → loadedTraceId stays null).
    releaseStream();
    const evs = useSimulator.getState().events;
    useSimulator.setState({
      status: "done",
      playing: false,
      following: true,
      cursor: evs.length - 1,
    });
    await p;
  });
});

// 040-message-attachments: pending chips are a transient draft list. Send must
// snapshot them atomically, ship the snapshot in the request, and reset the
// composer's pending list — so a chip uploaded mid-send queues for the *next*
// turn instead of smearing across two.
describe("useChat — pending attachments travel with the message", () => {
  it("send clears pending attachments + input and ships the snapshot ids", async () => {
    // AC1 + part of AC5 (FE side) — seed pendingDocuments + input, send,
    // assert both reset and the streamChat call carries the snapshot ids.
    vi.mocked(chatApi.createSession).mockResolvedValue(session("created"));
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("created")]);
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      handlers.onDone({ trace_id: "t", answer: "", session_id: "created" });
    });
    useChat.setState({
      input: "Sobre qual curso fala?",
      activeSessionId: "created",
      pendingDocuments: [docMeta("d1"), docMeta("d2")],
    });

    await useChat.getState().send();

    const s = useChat.getState();
    expect(s.pendingDocuments).toEqual([]);
    expect(s.input).toBe("");

    const call = vi.mocked(sse.streamChat).mock.calls[0];
    // Sixth positional arg is attachmentDocumentIds (after message, handlers,
    // signal, sessionId, overrides). The snapshot is in insertion order.
    expect(call[5]).toEqual(["d1", "d2"]);
  });

  it("an upload while a send is in flight queues for the NEXT turn (AC9)", async () => {
    // Set up a streamChat stub that defers onDone until we release it; this
    // mirrors the real race where ingestion finishes mid-stream.
    let releaseStream: () => void = () => {};
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    vi.mocked(sse.streamChat).mockImplementation(async (_m, handlers) => {
      await streamGate;
      handlers.onDone({ trace_id: "t", answer: "", session_id: "active" });
    });
    vi.mocked(chatApi.listMessages).mockResolvedValue([]);
    vi.mocked(chatApi.listSessions).mockResolvedValue([session("active")]);
    // Upload resolves immediately, calling onDone with the new doc payload.
    vi.mocked(chatApi.uploadDocument).mockImplementation(
      async (_sid, _file, handlers) => {
        handlers.onDone({
          trace_id: "u",
          document_id: "d-late",
          filename: "late.pdf",
          chunk_count: 5,
        });
      },
    );

    useChat.setState({
      input: "First message",
      activeSessionId: "active",
      pendingDocuments: [docMeta("d-early")],
    });

    const sendPromise = useChat.getState().send();

    // The snapshot must already be the in-flight payload + the composer must
    // already be cleared, BEFORE we release the network. Otherwise a mid-send
    // upload could smear into the wrong turn.
    await vi.waitFor(() => expect(sse.streamChat).toHaveBeenCalled());
    expect(useChat.getState().pendingDocuments).toEqual([]);

    // Now a fresh upload arrives while the previous send is still pending.
    const file = new File(["%PDF-"], "late.pdf", { type: "application/pdf" });
    await useChat.getState().uploadPdf(file);

    // The late upload is parked for the NEXT turn, not the in-flight one.
    expect(useChat.getState().pendingDocuments.map((d) => d.document_id)).toEqual([
      "d-late",
    ]);
    // The in-flight send still carries only the snapshot (d-early), unchanged.
    const call = vi.mocked(sse.streamChat).mock.calls[0];
    expect(call[5]).toEqual(["d-early"]);

    // Drain the in-flight stream so send() can settle cleanly.
    // The chat panel holds the persisted swap until the playhead drains; set
    // the simulator into a "settled" state so the await resolves.
    const evs = useSimulator.getState().events;
    useSimulator.setState({
      status: "done",
      playing: false,
      following: true,
      cursor: evs.length - 1,
    });
    releaseStream();
    await sendPromise;
  });
});
