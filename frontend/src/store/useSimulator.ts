import { create } from "zustand";

import { initialInspectorCollapsed } from "../lib/onboarding";
import { LIVE_STEP_MS, paceAdvance } from "../lib/pacing";
import type { StationId } from "../lib/stations";
import {
  beginTour,
  currentStep,
  IDLE_TOUR,
  pauseTour as pauseTourReducer,
  resumeTour as resumeTourReducer,
  TOUR_PACE_MS,
  tourNext as tourNextReducer,
  tourPrev as tourPrevReducer,
  tourStep,
  type TourState,
} from "../lib/tour";
import { tourTrace } from "../lib/tourTrace";
import type { TraceEvent } from "../types/events";

export type Status = "idle" | "streaming" | "done" | "error" | "cancelled";

interface SimulatorState {
  status: Status;
  events: TraceEvent[];
  cursor: number; // index of the last visible event (-1 = nothing yet)
  following: boolean; // cursor tracks the live tail
  playing: boolean; // replay animation running
  selected: StationId | null;
  expanded: StationId[]; // stations expanded inline on the canvas
  detail: StationId | null; // station opened in the focused drill-in overlay
  // 038-execution-traces — the run-level span tree opened in the Inspector body
  // (like a station detail, with a ← Overview back button), keyed off a boolean
  // (it is not a station, so it stays out of the StationId-exhaustive switches).
  tracesOpen: boolean;
  error: string | null;
  // Side-panel collapse (013-canvas-space-disclosure) — layout state kept here
  // (not local) so `select` can re-open the Inspector when a station is clicked.
  chatCollapsed: boolean;
  inspectorCollapsed: boolean;
  // Guided tour (005-guided-tour) — narrated phase-by-phase playback. The pure
  // reducer is in lib/tour.ts; the store drives cursor/selected from it and the
  // current phase carries the caption. Mutually exclusive with raw replay.
  tour: TourState;

  // `reveal` defaults to true: a manual click re-opens a collapsed Inspector (013
  // AC3). The tour passes `reveal: false` so the auto-tour keeps the canvas-first
  // frame on a first visit (037 AC4).
  select: (id: StationId | null, opts?: { reveal?: boolean }) => void;
  toggleExpand: (id: StationId) => void;
  openDetail: (id: StationId) => void;
  closeDetail: () => void;
  openTraces: () => void;
  closeTraces: () => void;
  toggleChat: () => void;
  toggleInspector: () => void;

  // Run lifecycle — chat send + PDF upload both drive these so the canvas
  // animates either flow from the one shared event log.
  beginRun: () => AbortSignal; // abort any prior run, reset, start streaming
  pushTrace: (event: TraceEvent) => void;
  endRun: () => void;
  failRun: (message: string) => void;
  // 016-cancel-stream: interrupt an in-flight run. Aborts the request signal,
  // stops the live ticker and marks the run `cancelled` — but keeps events/cursor
  // so the partial trace stays on the canvas, replayable/step-able (AC3).
  cancelRun: () => void;
  playBatch: (events: TraceEvent[]) => void; // load a finished trace and replay it
  // 022-message-trace-link: statically load a finished (past) turn's trace onto
  // the canvas — settled at the tail, no auto-replay (the user can press play).
  // A no-op while a live run is streaming, so revisiting can't corrupt it (AC3).
  loadTrace: (events: TraceEvent[]) => void;

  reset: () => void;
  setCursor: (index: number) => void;
  step: (delta: number) => void;
  togglePlay: () => void;

  startTour: () => void;
  pauseTour: () => void;
  resumeTour: () => void;
  stopTour: () => void;
  // 037 — manual ◀ ▶ stepping; each pauses the auto-play (via the reducer) so the
  // visitor reads at their own pace.
  tourNextStep: () => void;
  tourPrevStep: () => void;
}

let abort: AbortController | null = null;
let playTimer: ReturnType<typeof setInterval> | null = null;
let tourTimer: ReturnType<typeof setInterval> | null = null;
// 009-live-pacing: the live playhead ticker + the time of its last structural
// advance. Lives outside React state — it's timing, not view state.
let liveTimer: ReturnType<typeof setInterval> | null = null;
let liveAdvanceAt = 0;

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

function stopLiveTimer() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

// (Re)start the live ticker. While `following`, it walks the playhead toward the
// live tail at a paced cadence (see lib/pacing.ts) so the journey through the
// stations is legible instead of teleporting. It owns *only* the live, following
// playhead — the moment the user scrubs / replays / tours (following = false) it
// hands off and stops. After the run finishes it drains to the tail, then settles.
function startLiveTimer() {
  stopLiveTimer();
  liveAdvanceAt = Date.now();
  liveTimer = setInterval(() => {
    const state = useSimulator.getState();
    if (!state.following) {
      stopLiveTimer();
      return;
    }
    const { cursor, advancedAt } = paceAdvance(
      state.events,
      state.cursor,
      liveAdvanceAt,
      Date.now(),
    );
    liveAdvanceAt = advancedAt;
    if (cursor !== state.cursor) useSimulator.setState({ cursor });
    // Drain-then-settle: once caught up to a finished run, stop ticking.
    if (cursor >= state.events.length - 1 && state.status !== "streaming") {
      stopLiveTimer();
    }
  }, LIVE_STEP_MS);
}

// --- Tour driver helpers (resolve `useSimulator` lazily, at call time) --------

// Apply a tour step to the shared UI state: jump the playhead and open the
// step's station. The current phase (in `tour`) carries the caption.
function applyTourStep(tour: TourState) {
  const step = currentStep(tour);
  if (!step) return;
  const { setCursor, select } = useSimulator.getState();
  setCursor(step.cursor);
  // Keep the canvas the hero through the tour: highlight the station without
  // forcing a collapsed Inspector open (037 AC4) — the balloon narration teaches.
  select(step.station, { reveal: false });
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
  tracesOpen: false,
  error: null,
  chatCollapsed: false,
  // 037 — collapsed on the first visit only (canvas-first opening frame), else the
  // expanded default; clicking a station still re-opens it.
  inspectorCollapsed: initialInspectorCollapsed(),
  tour: IDLE_TOUR,

  // Selecting a station (non-null) re-opens the Inspector if it was collapsed, so
  // a click always reveals the data (013 AC3); deselecting leaves the panel as-is
  // (AC4). `reveal: false` opts out of the re-open so the tour can highlight a
  // station while keeping the canvas-first frame (037 AC4).
  select: (id, opts) =>
    set((s) => ({
      selected: id,
      // Selecting a station leaves the Execution-traces detail (038) — they share
      // the Inspector body, so only one shows at a time.
      tracesOpen: false,
      inspectorCollapsed:
        opts?.reveal === false ? s.inspectorCollapsed : id !== null ? false : s.inspectorCollapsed,
    })),
  toggleChat: () => set((s) => ({ chatCollapsed: !s.chatCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
  toggleExpand: (id) =>
    set((state) => ({
      expanded: state.expanded.includes(id)
        ? state.expanded.filter((x) => x !== id)
        : [...state.expanded, id],
    })),
  openDetail: (id) => set({ detail: id, selected: id }),
  closeDetail: () => set({ detail: null }),
  // 038 — the run-level span tree opens in the Inspector body (like a station
  // detail); clear `selected` so the tracesOpen branch wins over any station.
  openTraces: () => set({ tracesOpen: true, selected: null }),
  closeTraces: () => set({ tracesOpen: false }),

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
    startLiveTimer(); // pace the live journey instead of snapping to the tail
    return abort.signal;
  },

  // Append only — the paced live ticker (startLiveTimer) owns cursor advancement,
  // so a burst of events no longer teleports the playhead to the tail (009).
  pushTrace: (event) => set((state) => ({ events: [...state.events, event] })),

  // The run is over, but don't snap: the live ticker drains the remaining tail
  // (respond → db.write → backend) at the same cadence, then settles (009).
  endRun: () => set({ status: "done" }),

  failRun: (message) => set({ status: "error", error: message }),

  // 016-cancel-stream: terminal-but-non-destructive interrupt. Only acts on a
  // live run; aborts its signal (so the SSE fetch unwinds with AbortError and the
  // backend's producer is cancelled before db.write), stops the playhead ticker,
  // and freezes the partial trace in place (events/cursor untouched → replay/step
  // still work). `following: false` hands off the (now dead) live tail.
  cancelRun: () => {
    if (get().status !== "streaming") return;
    abort?.abort();
    stopLiveTimer();
    stopTimer();
    stopTourTimer();
    set({ status: "cancelled", following: false, playing: false });
  },

  playBatch: (events) => {
    // One blocking round-trip already finished; replay it from the top so the
    // journey still animates (just not live).
    stopTourTimer();
    set({ events, status: "done", cursor: -1, following: false, playing: false, tour: IDLE_TOUR });
    get().togglePlay();
  },

  // 022-message-trace-link: load a past turn's trace as a static, settled frame —
  // events in, cursor at the tail, `done`, with every timer (live/replay/tour)
  // stopped so nothing animates until the user presses play. Guarded against an
  // active run so revisiting a past turn never corrupts or resumes a live stream
  // (AC3); `deriveView` then renders it and step/replay operate over it (AC1).
  loadTrace: (events) => {
    if (get().status === "streaming") return;
    stopTimer();
    stopTourTimer();
    stopLiveTimer();
    set({
      events,
      cursor: events.length - 1,
      status: "done",
      following: false,
      playing: false,
      error: null,
      tour: IDLE_TOUR,
    });
  },

  reset: () => {
    abort?.abort();
    stopTimer();
    stopTourTimer();
    stopLiveTimer();
    set({
      status: "idle",
      events: [],
      cursor: -1,
      following: true,
      playing: false,
      error: null,
      selected: null,
      detail: null,
      tracesOpen: false,
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
    stopLiveTimer();
    const next = get().cursor + delta;
    get().setCursor(next);
    set({ playing: false, tour: IDLE_TOUR });
  },

  togglePlay: () => {
    stopLiveTimer(); // replay takes over the playhead from the live ticker
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
    // 014-tour-scripted (AC6): from an empty state, load the bundled canned
    // trace — a captured real run — so the tour can preview the full journey
    // with no backend call. Supersedes 005 AC5's empty-state gating.
    let events = get().events;
    if (events.length === 0) {
      events = tourTrace;
      set({ events, status: "done", cursor: -1, following: false });
    }
    const tour = beginTour(events);
    if (tour.status !== "playing") return; // still nothing replayable → no-op
    // Take over from any replay / live ticker.
    stopTimer();
    stopLiveTimer();
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

  // Manual stepping (037): stop the auto-advance, move one stop (the reducer
  // clamps and marks the tour `paused`), and apply the new stop to the canvas.
  tourNextStep: () => {
    stopTourTimer();
    const tour = tourNextReducer(get().tour);
    set({ tour });
    applyTourStep(tour);
  },

  tourPrevStep: () => {
    stopTourTimer();
    const tour = tourPrevReducer(get().tour);
    set({ tour });
    applyTourStep(tour);
  },
}));
