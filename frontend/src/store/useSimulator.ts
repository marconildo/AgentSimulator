import { create } from "zustand";

import { useSettings } from "../lib/settings";
import { batchChat, streamChat } from "../lib/sse";
import type { StationId } from "../lib/stations";
import type { TraceEvent } from "../types/events";

export type Status = "idle" | "streaming" | "done" | "error";

interface SimulatorState {
  input: string;
  status: Status;
  events: TraceEvent[];
  cursor: number; // index of the last visible event (-1 = nothing yet)
  following: boolean; // cursor tracks the live tail
  playing: boolean; // replay animation running
  selected: StationId | null;
  expanded: StationId[]; // stations expanded inline on the canvas
  detail: StationId | null; // station opened in the focused drill-in overlay
  error: string | null;

  setInput: (value: string) => void;
  select: (id: StationId | null) => void;
  toggleExpand: (id: StationId) => void;
  openDetail: (id: StationId) => void;
  closeDetail: () => void;
  send: () => Promise<void>;
  reset: () => void;
  setCursor: (index: number) => void;
  step: (delta: number) => void;
  togglePlay: () => void;
}

let abort: AbortController | null = null;
let playTimer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

export const useSimulator = create<SimulatorState>((set, get) => ({
  input: "",
  status: "idle",
  events: [],
  cursor: -1,
  following: true,
  playing: false,
  selected: null,
  expanded: [],
  detail: null,
  error: null,

  setInput: (value) => set({ input: value }),
  select: (id) => set({ selected: id }),
  toggleExpand: (id) =>
    set((state) => ({
      expanded: state.expanded.includes(id)
        ? state.expanded.filter((x) => x !== id)
        : [...state.expanded, id],
    })),
  openDetail: (id) => set({ detail: id, selected: id }),
  closeDetail: () => set({ detail: null }),

  send: async () => {
    const message = get().input.trim();
    if (!message || get().status === "streaming") return;

    const mode = useSettings.getState().mode;
    abort?.abort();
    abort = new AbortController();
    stopTimer();
    set({
      status: "streaming",
      events: [],
      cursor: -1,
      following: true,
      playing: false,
      error: null,
    });

    try {
      if (mode === "batch") {
        // One blocking round-trip: wait for the whole trace, then replay it
        // from the top so the journey still animates (just not live).
        const summary = await batchChat(message, abort.signal);
        set({ events: summary.events, status: "done", cursor: -1, following: false, playing: false });
        get().togglePlay();
        return;
      }

      await streamChat(
        message,
        {
          onTrace: (event) =>
            set((state) => {
              const events = [...state.events, event];
              return { events, cursor: state.following ? events.length - 1 : state.cursor };
            }),
          onDone: () => set((state) => ({ status: "done", cursor: state.events.length - 1 })),
        },
        abort.signal,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      set({ status: "error", error: (err as Error).message });
    }
  },

  reset: () => {
    abort?.abort();
    stopTimer();
    set({
      status: "idle",
      events: [],
      cursor: -1,
      following: true,
      playing: false,
      error: null,
      selected: null,
      detail: null,
    });
  },

  setCursor: (index) =>
    set((state) => {
      const max = state.events.length - 1;
      const cursor = Math.max(0, Math.min(index, max));
      return { cursor, following: cursor >= max };
    }),

  step: (delta) => {
    stopTimer();
    const next = get().cursor + delta;
    get().setCursor(next);
    set({ playing: false });
  },

  togglePlay: () => {
    if (get().playing) {
      stopTimer();
      set({ playing: false });
      return;
    }
    const { cursor, events } = get();
    // Restart from the top if we're already at the end.
    set({ playing: true, following: false, cursor: cursor >= events.length - 1 ? -1 : cursor });

    playTimer = setInterval(() => {
      const state = get();
      if (state.cursor >= state.events.length - 1) {
        stopTimer();
        set({ playing: false, following: true });
        return;
      }
      set({ cursor: state.cursor + 1 });
    }, 280);
  },
}));
