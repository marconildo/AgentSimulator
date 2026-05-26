import { create } from "zustand";

import {
  createSession,
  deleteDocument,
  deleteSession,
  listDocuments,
  listMessages,
  listSessions,
  uploadDocument,
  type ChatMessage,
  type DocumentMeta,
  type SessionMeta,
} from "../lib/chatApi";
import { useSettings } from "../lib/settings";
import { batchChat, streamChat } from "../lib/sse";
import { useSimulator } from "./useSimulator";

export type ChatView = "list" | "thread";

interface ChatState {
  view: ChatView;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  documents: DocumentMeta[];
  // The just-sent user message, shown optimistically while the agent runs.
  pending: string | null;
  input: string;
  loading: boolean; // loading a thread's messages/documents
  sending: boolean; // a chat round-trip is in flight
  uploading: boolean; // a PDF is being ingested
  error: string | null;

  setInput: (value: string) => void;
  showList: () => Promise<void>;
  init: () => Promise<void>;
  openSession: (id: string) => Promise<void>;
  newChat: () => Promise<void>;
  clearConversation: () => Promise<void>;
  send: () => Promise<void>;
  uploadPdf: (file: File) => Promise<void>;
  removeDocument: (documentId: string) => Promise<void>;
}

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError";

export const useChat = create<ChatState>((set, get) => ({
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

  setInput: (value) => set({ input: value }),

  showList: async () => {
    // Refresh on the way back so titles / counts reflect the latest activity.
    try {
      set({ sessions: await listSessions() });
    } catch {
      /* keep the stale list rather than blanking the sidebar */
    }
    set({ view: "list" });
  },

  init: async () => {
    set({ loading: true, error: null });
    try {
      const sessions = await listSessions();
      if (sessions.length > 0) {
        set({ sessions });
        await get().openSession(sessions[0].id);
      } else {
        const created = await createSession();
        set({ sessions: [created] });
        await get().openSession(created.id);
      }
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  openSession: async (id) => {
    set({ activeSessionId: id, view: "thread", loading: true, pending: null });
    try {
      const [messages, documents] = await Promise.all([listMessages(id), listDocuments(id)]);
      set({ messages, documents });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  newChat: async () => {
    try {
      const created = await createSession();
      set((s) => ({
        sessions: [created, ...s.sessions],
        activeSessionId: created.id,
        messages: [],
        documents: [],
        pending: null,
        input: "",
        view: "thread",
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  clearConversation: async () => {
    const id = get().activeSessionId;
    if (!id) return;
    try {
      await deleteSession(id);
      set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
    } catch (err) {
      set({ error: (err as Error).message });
      return;
    }
    // AC4 — after clearing, show a fresh conversation.
    await get().newChat();
  },

  send: async () => {
    const message = get().input.trim();
    if (!message || get().sending) return;

    let sessionId = get().activeSessionId;
    if (!sessionId) {
      await get().newChat();
      sessionId = get().activeSessionId;
    }
    if (!sessionId) return;

    const mode = useSettings.getState().mode;
    const sim = useSimulator.getState();
    const signal = sim.beginRun();
    set({ sending: true, pending: message, input: "", error: null });

    try {
      if (mode === "batch") {
        const summary = await batchChat(message, signal, sessionId);
        useSimulator.getState().playBatch(summary.events);
      } else {
        await streamChat(
          message,
          {
            onTrace: (e) => useSimulator.getState().pushTrace(e),
            onDone: () => useSimulator.getState().endRun(),
          },
          signal,
          sessionId,
        );
      }
      // Reload from the system of record so the thread shows the persisted
      // message + its retrieved chunks, and the list reflects the new title.
      const [messages, sessions] = await Promise.all([listMessages(sessionId), listSessions()]);
      set({ messages, sessions, pending: null });
    } catch (err) {
      if (isAbort(err)) return;
      useSimulator.getState().failRun((err as Error).message);
      set({ error: (err as Error).message, pending: null });
    } finally {
      set({ sending: false });
    }
  },

  uploadPdf: async (file) => {
    const sessionId = get().activeSessionId;
    if (!sessionId || get().uploading) return;

    const sim = useSimulator.getState();
    const signal = sim.beginRun();
    set({ uploading: true, error: null });

    try {
      await uploadDocument(
        sessionId,
        file,
        {
          onTrace: (e) => useSimulator.getState().pushTrace(e),
          onDone: () => useSimulator.getState().endRun(),
        },
        signal,
      );
      set({ documents: await listDocuments(sessionId) });
    } catch (err) {
      if (isAbort(err)) return;
      useSimulator.getState().failRun((err as Error).message);
      set({ error: (err as Error).message });
    } finally {
      set({ uploading: false });
    }
  },

  removeDocument: async (documentId) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    try {
      await deleteDocument(sessionId, documentId);
      set({ documents: await listDocuments(sessionId) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
