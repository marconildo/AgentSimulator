import { create } from "zustand";

import type { StationId } from "../lib/stations";
import type { TraceEvent } from "../types/events";

export type Status = "idle" | "streaming" | "done" | "error";

interface SimulatorState {
  status: Status;
  events: TraceEvent[];
  cursor: number; // index of the last visible event (-1 = nothing yet)
  following: boolean; // cursor tracks the live tail
  playing: boolean; // replay animation running
  selected: StationId | null;
  expanded: StationId[]; // stations expanded inline on the canvas
  detail: StationId | null; // station opened in the focused drill-in overlay
  error: string | null;

  select: (id: StationId | null) => void;
  toggleExpand: (id: StationId) => void;
  openDetail: (id: StationId) => void;
  closeDetail: () => void;

  // Run lifecycle — chat send + PDF upload both drive these so the canvas
  // animates either flow from the one shared event log.
  beginRun: () => AbortSignal; // abort any prior run, reset, start streaming
  pushTrace: (event: TraceEvent) => void;
  endRun: () => void;
  failRun: (message: string) => void;
  playBatch: (events: TraceEvent[]) => void; // load a finished trace and replay it

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
  status: "idle",
  events: [],
  cursor: -1,
  following: true,
  playing: false,
  selected: null,
  expanded: [],
  detail: null,
  error: null,

  select: (id) => set({ selected: id }),
  toggleExpand: (id) =>
    set((state) => ({
      expanded: state.expanded.includes(id)
        ? state.expanded.filter((x) => x !== id)
        : [...state.expanded, id],
    })),
  openDetail: (id) => set({ detail: id, selected: id }),
  closeDetail: () => set({ detail: null }),

  beginRun: () => {
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
    return abort.signal;
  },

  pushTrace: (event) =>
    set((state) => {
      const events = [...state.events, event];
      return { events, cursor: state.following ? events.length - 1 : state.cursor };
    }),

  endRun: () => set((state) => ({ status: "done", cursor: state.events.length - 1 })),

  failRun: (message) => set({ status: "error", error: message }),

  playBatch: (events) => {
    // One blocking round-trip already finished; replay it from the top so the
    // journey still animates (just not live).
    set({ events, status: "done", cursor: -1, following: false, playing: false });
    get().togglePlay();
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
