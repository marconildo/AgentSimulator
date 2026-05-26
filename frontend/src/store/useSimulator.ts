import { create } from "zustand";

import type { StationId } from "../lib/stations";
import {
  beginTour,
  currentStep,
  IDLE_TOUR,
  pauseTour as pauseTourReducer,
  resumeTour as resumeTourReducer,
  TOUR_PACE_MS,
  tourStep,
  type TourState,
} from "../lib/tour";
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
  // Guided tour (005-guided-tour) — narrated phase-by-phase playback. The pure
  // reducer is in lib/tour.ts; the store drives cursor/selected from it and the
  // current phase carries the caption. Mutually exclusive with raw replay.
  tour: TourState;

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

  startTour: () => void;
  pauseTour: () => void;
  resumeTour: () => void;
  stopTour: () => void;
}

let abort: AbortController | null = null;
let playTimer: ReturnType<typeof setInterval> | null = null;
let tourTimer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function stopTourTimer() {
  if (tourTimer) {
    clearInterval(tourTimer);
    tourTimer = null;
  }
}

// --- Tour driver helpers (resolve `useSimulator` lazily, at call time) --------

// Apply a tour step to the shared UI state: jump the playhead and open the
// step's station. The current phase (in `tour`) carries the caption.
function applyTourStep(tour: TourState) {
  const step = currentStep(tour);
  if (!step) return;
  const { setCursor, select } = useSimulator.getState();
  setCursor(step.cursor);
  select(step.station);
}

// (Re)start the tour timer — advances one phase per tick at a fixed pace, and
// auto-stops on the last phase, settling on the final frame and releasing the
// forced station selection (AC4).
function startTourTimer() {
  stopTourTimer();
  tourTimer = setInterval(() => {
    const state = useSimulator.getState();
    const next = tourStep(state.tour);
    if (next.status === "done") {
      stopTourTimer();
      useSimulator.setState({ tour: next, selected: null });
      state.setCursor(state.events.length - 1);
      return;
    }
    useSimulator.setState({ tour: next });
    applyTourStep(next);
  }, TOUR_PACE_MS);
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
  tour: IDLE_TOUR,

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
    stopTourTimer();
    set({
      status: "streaming",
      events: [],
      cursor: -1,
      following: true,
      playing: false,
      error: null,
      tour: IDLE_TOUR,
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
    stopTourTimer();
    set({ events, status: "done", cursor: -1, following: false, playing: false, tour: IDLE_TOUR });
    get().togglePlay();
  },

  reset: () => {
    abort?.abort();
    stopTimer();
    stopTourTimer();
    set({
      status: "idle",
      events: [],
      cursor: -1,
      following: true,
      playing: false,
      error: null,
      selected: null,
      detail: null,
      tour: IDLE_TOUR,
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
    stopTourTimer();
    const next = get().cursor + delta;
    get().setCursor(next);
    set({ playing: false, tour: IDLE_TOUR });
  },

  togglePlay: () => {
    // Raw replay and the guided tour are mutually exclusive — toggling replay
    // ends any tour in progress.
    if (get().tour.status !== "idle") {
      stopTourTimer();
      set({ tour: IDLE_TOUR });
    }
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

  startTour: () => {
    const tour = beginTour(get().events);
    if (tour.status !== "playing") return; // AC5: no replayable trace → no-op
    // Take over from any replay.
    stopTimer();
    set({ playing: false, following: false, tour });
    applyTourStep(tour); // first phase applies immediately
    startTourTimer();
  },

  pauseTour: () => {
    stopTourTimer();
    set((state) => ({ tour: pauseTourReducer(state.tour) }));
  },

  resumeTour: () => {
    const tour = resumeTourReducer(get().tour);
    if (tour.status !== "playing") return;
    set({ tour });
    startTourTimer();
  },

  stopTour: () => {
    stopTourTimer();
    set({ tour: IDLE_TOUR, selected: null });
  },
}));
