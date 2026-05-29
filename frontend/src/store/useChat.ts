import { create } from "zustand";

import {
  clearData,
  createSession,
  deleteDocument,
  listAgents,
  listMessages,
  listSessions,
  setSessionAgent,
  uploadDocument,
  type AgentMeta,
  type ChatMessage,
  type ClearResult,
  type DocumentMeta,
  type SessionMeta,
} from "../lib/chatApi";
import { isFlowSettled } from "../lib/chatStatus";
import { clearDraftPending, isDraftPending, markDraftPending } from "../lib/draftSession";
import { overridesFor, useExperiment } from "../lib/experiment";
import { useSettings } from "../lib/settings";
import { batchChat, streamChat } from "../lib/sse";
import { loadTrace as loadCachedTrace } from "../lib/traceCache";
import { useSimulator } from "./useSimulator";

export type ChatView = "list" | "thread";

interface ChatState {
  view: ChatView;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  // 040-message-attachments: documents the composer is holding for the NEXT
  // send. A transient draft list — not the session-wide doc inventory.
  // Cleared synchronously on send (the snapshot travels with the request and
  // is rendered on the persisted user bubble) and on context switches
  // (openSession / newChat / clearAll).
  pendingDocuments: DocumentMeta[];
  // The just-sent user message, shown optimistically while the agent runs.
  pending: string | null;
  // 040-message-attachments: pending → snapshot at send time so the optimistic
  // user bubble shows the same chips that will land on the persisted message.
  pendingAttachments: DocumentMeta[];
  input: string;
  loading: boolean; // loading a thread's messages
  sending: boolean; // a chat round-trip is in flight
  uploading: boolean; // a PDF is being ingested
  // 016-cancel-stream: transient flag — the last run was cancelled by the user.
  // Cleared on the next send / conversation switch; drives the "run cancelled" note.
  cancelled: boolean;
  // 022-message-trace-link: the message whose trace is currently on the canvas
  // (null = none / a fresh draft), and whether the last load hit an evicted trace
  // (drives the "trace expired" / click-to-load affordance). Both per conversation.
  loadedTraceId: string | null;
  traceExpired: boolean;
  error: string | null;
  // 045-composer-agent-selector: transient note when the server says
  // `agent_locked` on PATCH (e.g. stale tab). The composer chip + the 044
  // catalog sidebar show this string and the chip flips locked on next render.
  agentLockedNote: string | null;
  // 045-composer-agent-selector / draft fix: the agent to use for the NEXT
  // draft conversation (when `activeSessionId` is null — i.e. right after a
  // `+ Novo chat` click, before the session row is lazily created). Seeded
  // from the catalog's default in `init()` / `newChat()` so the composer chip
  // never reads as blank in the draft state. Picking a different agent in the
  // chip while drafting only mutates this field (no API call); when the user
  // finally sends, `ensureSession` patches the freshly-created session to it.
  draftAgent: AgentMeta | null;

  setInput: (value: string) => void;
  // 045-composer-agent-selector: surface the lock note + auto-clear after a
  // short delay (consistent with other transient notes in this store).
  setAgentLockedNote: (note: string | null) => void;
  // 045 draft fix: explicitly set the draft agent (chip selection while no
  // session is active). Pass `null` to reset back to whatever the catalog
  // currently flags as default — a quiet refetch fills it in.
  setDraftAgent: (agent: AgentMeta | null) => void;
  showList: () => Promise<void>;
  init: () => Promise<void>;
  openSession: (id: string) => Promise<void>;
  // 022-message-trace-link: load a past turn's trace onto the canvas (memoized
  // fetch → simulator). An evicted trace flips `traceExpired` instead of crashing.
  selectMessage: (messageId: string) => Promise<void>;
  newChat: () => Promise<void>;
  // Lazily persist the active conversation, creating one if we're in a draft.
  // Returns the session id, or null if creation failed.
  ensureSession: () => Promise<string | null>;
  // `text` lets a one-click suggested question send itself without first filling
  // the input box (§3.10); omitted, it sends the current input as before.
  send: (text?: string) => Promise<void>;
  // 016-cancel-stream: interrupt the in-flight run. No-op when nothing is sending.
  cancel: () => void;
  uploadPdf: (file: File) => Promise<void>;
  removeDocument: (documentId: string) => Promise<void>;
  // 025-clear-databases: wipe all relational history + imported vectors (keeps
  // the built-in corpus), then reset the UI to a fresh draft. Returns the counts
  // removed, or null if the request failed.
  clearAll: () => Promise<ClearResult | null>;
  // 042-agent-anatomy: replace a single session record after a server PATCH so
  // the sidebar + Agent station header reflect the updated metadata (e.g. the
  // new `agent_name`) without an extra `listSessions` round-trip.
  replaceSession: (session: SessionMeta) => void;
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

// 045 draft fix: pull the catalog and seed `draftAgent` with whichever entry
// the server flags as default — falls back to the first row if no `is_default`,
// and to `null` on a missing/failed catalog (the chip degrades to its "—" hint
// until the catalog loads). Best-effort by design: a draft chip read with no
// default yet is preferable to crashing init().
async function refreshDraftDefault(): Promise<void> {
  try {
    const agents = await listAgents();
    const next = agents.find((a) => a.is_default) ?? agents[0] ?? null;
    useChat.setState({ draftAgent: next });
  } catch {
    /* keep whatever draftAgent we had; the chip's "—" fallback is fine */
  }
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
  pendingDocuments: [],
  pending: null,
  pendingAttachments: [],
  input: "",
  loading: false,
  sending: false,
  uploading: false,
  cancelled: false,
  loadedTraceId: null,
  traceExpired: false,
  error: null,
  agentLockedNote: null,
  draftAgent: null,

  setInput: (value) => set({ input: value }),
  setDraftAgent: (agent) => set({ draftAgent: agent }),
  setAgentLockedNote: (note) => {
    set({ agentLockedNote: note });
    if (note) {
      // Auto-clear after 6s so the note doesn't linger; matches the rough
      // cadence of other transient notes (e.g. cancelled, uploadFailed).
      window.setTimeout(() => {
        if (useChat.getState().agentLockedNote === note) {
          set({ agentLockedNote: null });
        }
      }, 6000);
    }
  },

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
      // Prefetch the catalog so the draft composer chip never reads as blank
      // (045 draft fix). Best-effort: a failure leaves draftAgent null and the
      // chip falls back to "—" until the catalog loads later.
      void refreshDraftDefault();
      const sessions = await listSessions();
      set({ sessions });
      // If the user clicked "New conversation" and then refreshed, honor that
      // intent — the draft flag survives the reload and pins the empty thread.
      if (sessions.length === 0 || isDraftPending()) {
        await get().newChat();
      } else {
        await get().openSession(sessions[0].id);
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
    // Opening a real session cancels any pending-draft intent (so a later
    // refresh stays on this thread, not on an empty draft).
    clearDraftPending();
    set({
      activeSessionId: id,
      view: "thread",
      loading: true,
      pending: null,
      // 040-message-attachments: session-context switch — the composer's
      // pending list is per-draft, never carried across conversations. Past
      // uploads in this session live on the messages they were attached to.
      pendingDocuments: [],
      pendingAttachments: [],
      cancelled: false,
      loadedTraceId: null,
      traceExpired: false,
    });
    try {
      const messages = await listMessages(id);
      set({ messages });
      // 022: never leave the canvas dead — auto-load the latest turn's trace
      // (messages are oldest-first, so the newest is last). An evicted latest
      // trace falls back to the click-to-load hint via `traceExpired`.
      const latest = messages[messages.length - 1];
      if (latest) await get().selectMessage(latest.id);
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  selectMessage: async (messageId) => {
    // message.id === trace_id (the backend persists the message under its trace
    // id), so the message id is the trace key. The loader is memoized and never
    // throws — an evicted trace resolves to `expired`.
    const result = await loadCachedTrace(messageId);
    if (!result.ok) {
      set({ traceExpired: true });
      return;
    }
    useSimulator.getState().loadTrace(result.events);
    set({ traceExpired: false, loadedTraceId: messageId });
  },

  newChat: async () => {
    // Draft conversation: show an empty thread but DON'T persist a session yet.
    // The row is created lazily by ensureSession() on the first real action
    // (sending a message or uploading a PDF), so a bare "New chat" click never
    // leaves an empty conversation in the history.
    //
    // Persist the draft intent in localStorage so a page refresh stays on the
    // empty thread instead of silently reopening the last session.
    //
    // A new conversation starts from a blank canvas — wipe any prior run's
    // trace, cursor and selection from the visualizer.
    useSimulator.getState().reset();
    markDraftPending();
    set({
      view: "thread",
      activeSessionId: null,
      messages: [],
      // 040-message-attachments: new draft starts with a clean composer.
      pendingDocuments: [],
      pendingAttachments: [],
      pending: null,
      input: "",
      cancelled: false,
      loadedTraceId: null,
      traceExpired: false,
      error: null,
      // 045 draft fix: every new draft starts from the catalog's current
      // default (which may have changed since boot if 044's dialog tagged a
      // different one). Refetched below so the chip mirrors live catalog state.
      draftAgent: null,
    });
    await refreshDraftDefault();
  },

  ensureSession: async () => {
    const existing = get().activeSessionId;
    if (existing) return existing;
    try {
      let created = await createSession();
      // 045 draft fix: if the user picked a non-default agent on the draft
      // chip, the session was created linked to the catalog default — switch
      // it now (the lock only triggers once a message is persisted, so this
      // patch is safe on a brand-new session). Same-id PATCH is a 200 no-op
      // server-side, but skipping it locally avoids the extra round-trip.
      const draft = get().draftAgent;
      if (draft && draft.id !== created.agent?.id) {
        try {
          const patched = await setSessionAgent(created.id, draft.id);
          if (patched) created = patched;
        } catch {
          // The send goes on with the default-linked agent — preferable to
          // failing the whole turn over a chip preference.
        }
      }
      // Carry any experiment settings the user tuned on the draft over to the
      // now-persisted conversation (AC7).
      useExperiment.getState().adopt(null, created.id);
      // The draft just became a real session — drop the pending-draft flag.
      clearDraftPending();
      set((s) => ({ sessions: [created, ...s.sessions], activeSessionId: created.id }));
      return created.id;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  send: async (text?: string) => {
    const message = (text ?? get().input).trim();
    if (!message || get().sending) return;

    // 040-message-attachments: snapshot the composer's pending attachments
    // *atomically*, BEFORE any await, then clear the composer in the same
    // commit. This way an upload that finishes mid-send (uploadPdf appends to
    // pendingDocuments) goes onto the *next* turn's snapshot, not this one
    // (AC9). The snapshot rides along with the request (attachment_document_ids)
    // and also feeds the optimistic in-flight user bubble (pendingAttachments).
    const attachmentSnapshot = get().pendingDocuments;
    const attachmentIds = attachmentSnapshot.map((d) => d.document_id);

    // First message of a draft persists the conversation (lazy creation).
    const sessionId = await get().ensureSession();
    if (!sessionId) return;

    const mode = useSettings.getState().mode;
    // The experiment overrides for this conversation (006); empty when untouched.
    const overrides = overridesFor(sessionId);
    const sim = useSimulator.getState();
    const signal = sim.beginRun();
    set({
      sending: true,
      pending: message,
      pendingAttachments: attachmentSnapshot,
      pendingDocuments: [],
      input: "",
      error: null,
      cancelled: false,
      // 050-replay-bubble-streaming regression: the previously-loaded turn must
      // stop being "the loaded trace" the moment a new run begins — otherwise
      // its bubble flips into the replay branch and re-projects the *new* run's
      // streaming events onto the old message ("duplicating the thinking"). The
      // tail of send() resets it to the just-persisted turn's id.
      loadedTraceId: null,
    });

    try {
      if (mode === "batch") {
        const summary = await batchChat(
          message,
          signal,
          sessionId,
          overrides,
          attachmentIds,
        );
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
          attachmentIds,
        );
      }
      // Reload from the system of record so the thread shows the persisted
      // message + its retrieved chunks, and the list reflects the new title.
      const [messages, sessions] = await Promise.all([listMessages(sessionId), listSessions()]);
      // Hold the live bubble (status → streaming answer) until the paced playhead
      // finishes draining, so the chat never jumps ahead of the flow (012).
      await waitForFlowSettled(signal);
      if (signal.aborted) return; // a newer run took over — don't clobber its state
      // The canvas is showing this just-finished turn's live trace; mark it as
      // the loaded turn so the revisit affordance (022) stays coherent. The
      // persisted message carries the attachment chips from now on; drop the
      // in-flight snapshot since the real bubble is rendered.
      const newest = messages[messages.length - 1];
      set({
        messages,
        sessions,
        pending: null,
        pendingAttachments: [],
        loadedTraceId: newest?.id ?? null,
      });
    } catch (err) {
      if (isAbort(err)) return;
      useSimulator.getState().failRun((err as Error).message);
      set({ error: (err as Error).message, pending: null, pendingAttachments: [] });
    } finally {
      set({ sending: false });
    }
  },

  // 016-cancel-stream: interrupt the active run. Delegates the abort + the
  // partial-trace-preserving "cancelled" transition to the simulator (which owns
  // the AbortController and the playhead), then settles the chat into a clean,
  // non-error terminal state: drop the optimistic bubble, stop "sending", raise
  // the transient `cancelled` note. The in-flight send() catches the resulting
  // AbortError (isAbort → return), so the discarded turn is never reloaded. No-op
  // when nothing is sending (AC1).
  cancel: () => {
    if (!get().sending) return;
    useSimulator.getState().cancelRun();
    // 040-message-attachments: drop the optimistic in-flight chip snapshot
    // too — the cancelled turn was never persisted, so nothing carries them.
    set({ sending: false, cancelled: true, pending: null, pendingAttachments: [] });
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
      // 040-message-attachments: the upload endpoint's `done` frame already
      // carries every field DocumentMeta needs (id, filename, chunk_count) —
      // append the new doc directly to `pendingDocuments` instead of
      // refetching the whole session list. The chip shows up in the composer
      // and stays there until the user sends (or removes) it.
      await uploadDocument(
        sessionId,
        file,
        {
          onTrace: (e) => useSimulator.getState().pushTrace(e),
          onDone: (done) => {
            useSimulator.getState().endRun();
            set((s) => ({
              pendingDocuments: [
                ...s.pendingDocuments,
                {
                  document_id: done.document_id,
                  filename: done.filename,
                  chunk_count: done.chunk_count,
                  created_at: Date.now() / 1000,
                },
              ],
            }));
          },
        },
        signal,
      );
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
      // 040-message-attachments: removal happens while the chip is still
      // pending (composer-staged). The backend wipes vectors + the stored
      // blob + the row; the FE just splices the chip out of `pendingDocuments`.
      // (Chips on already-persisted messages have no X — see ChatPanel.)
      await deleteDocument(sessionId, documentId);
      set((s) => ({
        pendingDocuments: s.pendingDocuments.filter((d) => d.document_id !== documentId),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  clearAll: async () => {
    try {
      const result = await clearData();
      // Everything is gone server-side — drop the (now-empty) sidebar list and
      // open a fresh draft. newChat() clears the active thread and resets the
      // visualizer, so the app lands on a clean slate.
      set({ sessions: [] });
      await get().newChat();
      return result;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  replaceSession: (session) =>
    set((s) => ({
      sessions: s.sessions.map((row) => (row.id === session.id ? { ...row, ...session } : row)),
    })),
}));
