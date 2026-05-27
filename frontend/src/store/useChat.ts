import { create } from "zustand";

import {
  createSession,
  deleteDocument,
  listDocuments,
  listMessages,
  listSessions,
  uploadDocument,
  type ChatMessage,
  type DocumentMeta,
  type SessionMeta,
} from "../lib/chatApi";
import { isFlowSettled } from "../lib/chatStatus";
import { overridesFor, useExperiment } from "../lib/experiment";
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
  // Lazily persist the active conversation, creating one if we're in a draft.
  // Returns the session id, or null if creation failed.
  ensureSession: () => Promise<string | null>;
  send: () => Promise<void>;
  uploadPdf: (file: File) => Promise<void>;
  removeDocument: (documentId: string) => Promise<void>;
}

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError";

// 012-chat-flow-sync: the network round-trip finishes in well under a second, but
// the canvas plays the journey back at a paced cadence (009). Resolve only once the
// paced playhead has *settled* (run over, drained to the tail) — or the run was
// aborted — so the persisted answer never replaces the live bubble ahead of the
// flow. Checks the current state first, then watches for the settling transition.
function settledOrAborted(
  signal: AbortSignal,
  state: ReturnType<typeof useSimulator.getState>,
): boolean {
  if (signal.aborted) return true;
  if (isFlowSettled(state)) return true;
  // Nothing to animate (no trace events) and the run is over → don't wait.
  return state.events.length === 0 && state.status !== "streaming";
}

function waitForFlowSettled(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (settledOrAborted(signal, useSimulator.getState())) {
      resolve();
      return;
    }
    const unsubscribe = useSimulator.subscribe((state) => {
      if (settledOrAborted(signal, state)) {
        unsubscribe();
        resolve();
      }
    });
  });
}

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
      set({ sessions });
      if (sessions.length > 0) {
        await get().openSession(sessions[0].id);
      } else {
        // No history yet — open an empty draft instead of persisting a session.
        await get().newChat();
      }
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  openSession: async (id) => {
    // A different conversation — wipe the visualizer so it doesn't keep
    // animating the previous run's trace under the newly-opened thread.
    useSimulator.getState().reset();
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
    // Draft conversation: show an empty thread but DON'T persist a session yet.
    // The row is created lazily by ensureSession() on the first real action
    // (sending a message or uploading a PDF), so a bare "New chat" click never
    // leaves an empty conversation in the history.
    //
    // A new conversation starts from a blank canvas — wipe any prior run's
    // trace, cursor and selection from the visualizer.
    useSimulator.getState().reset();
    set({
      view: "thread",
      activeSessionId: null,
      messages: [],
      documents: [],
      pending: null,
      input: "",
      error: null,
    });
  },

  ensureSession: async () => {
    const existing = get().activeSessionId;
    if (existing) return existing;
    try {
      const created = await createSession();
      // Carry any experiment settings the user tuned on the draft over to the
      // now-persisted conversation (AC7).
      useExperiment.getState().adopt(null, created.id);
      set((s) => ({ sessions: [created, ...s.sessions], activeSessionId: created.id }));
      return created.id;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  send: async () => {
    const message = get().input.trim();
    if (!message || get().sending) return;

    // First message of a draft persists the conversation (lazy creation).
    const sessionId = await get().ensureSession();
    if (!sessionId) return;

    const mode = useSettings.getState().mode;
    // The experiment overrides for this conversation (006); empty when untouched.
    const overrides = overridesFor(sessionId);
    const sim = useSimulator.getState();
    const signal = sim.beginRun();
    set({ sending: true, pending: message, input: "", error: null });

    try {
      if (mode === "batch") {
        const summary = await batchChat(message, signal, sessionId, overrides);
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
          overrides,
        );
      }
      // Reload from the system of record so the thread shows the persisted
      // message + its retrieved chunks, and the list reflects the new title.
      const [messages, sessions] = await Promise.all([listMessages(sessionId), listSessions()]);
      // Hold the live bubble (status → streaming answer) until the paced playhead
      // finishes draining, so the chat never jumps ahead of the flow (012).
      await waitForFlowSettled(signal);
      if (signal.aborted) return; // a newer run took over — don't clobber its state
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
    if (get().uploading) return;
    // A PDF needs a conversation to attach to — persist the draft if needed.
    const sessionId = await get().ensureSession();
    if (!sessionId) return;

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
