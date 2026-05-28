// 025-clear-databases: the ⚙️ Settings "Clear databases" action wipes both
// stores server-side, then resets the UI to a fresh draft. This pins the store
// action the confirm button fires (AC5): it calls the clear API once and leaves
// an empty sidebar, no active session, no messages/documents, and a reset canvas.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteDocument: vi.fn(),
  listSessions: vi.fn(),
  listMessages: vi.fn(),
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  clearData: vi.fn(),
}));

vi.mock("../lib/sse", () => ({
  API_BASE: "",
  consumeEventStream: vi.fn(),
  streamChat: vi.fn(),
  batchChat: vi.fn(),
}));

import * as chatApi from "../lib/chatApi";
import type { TraceEvent } from "../types/events";
import { useChat } from "./useChat";
import { useSimulator } from "./useSimulator";

const session = (id: string) => ({
  id,
  title: null,
  created_at: 0,
  updated_at: 0,
  message_count: 0,
});

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

beforeEach(() => {
  vi.clearAllMocks();
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
  useSimulator.getState().reset();
});

describe("useChat — clearAll (025-clear-databases)", () => {
  it("wipes both stores then resets to a fresh draft (AC5)", async () => {
    const counts = {
      sessions_deleted: 3,
      messages_deleted: 9,
      documents_deleted: 2,
      skills_deleted: 4,
      vectors_removed: 17,
    };
    vi.mocked(chatApi.clearData).mockResolvedValue(counts);
    useChat.setState({
      sessions: [session("a"), session("b")],
      activeSessionId: "a",
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
      pendingDocuments: [{ document_id: "d", filename: "x.pdf", chunk_count: 3, created_at: 0 }],
    });
    // A leftover run on the canvas must be wiped too.
    useSimulator.setState({ events: [staleEvent], cursor: 0, status: "done" });

    const result = await useChat.getState().clearAll();

    expect(chatApi.clearData).toHaveBeenCalledOnce();
    expect(result).toEqual(counts);

    const s = useChat.getState();
    expect(s.sessions).toEqual([]);
    expect(s.activeSessionId).toBeNull();
    expect(s.messages).toEqual([]);
    expect(s.pendingDocuments).toEqual([]);
    expect(s.pendingAttachments).toEqual([]);

    const sim = useSimulator.getState();
    expect(sim.events).toEqual([]);
    expect(sim.status).toBe("idle");
  });

  it("surfaces an error and leaves state intact when the clear fails", async () => {
    vi.mocked(chatApi.clearData).mockRejectedValue(new Error("boom"));
    useChat.setState({ sessions: [session("a")], activeSessionId: "a" });

    const result = await useChat.getState().clearAll();

    expect(result).toBeNull();
    expect(useChat.getState().error).toBe("boom");
    // The clear didn't happen, so the existing conversation is untouched.
    expect(useChat.getState().sessions.map((x) => x.id)).toEqual(["a"]);
  });
});
