// Guided tour (005-guided-tour). A pure reducer that walks 004's timeline phases
// one at a time, yielding for each phase a {cursor, station, phase} step the
// driver applies to existing UI state (setCursor + select + a caption). It is a
// pure projection of the event log: no backend, no new request, no protocol or
// `Stage` change — the tour only *reads* `phaseMarkers` and `STAGE_TO_STATION`.

import type { Lang } from "../i18n";
import { UI } from "../i18n/strings";
import type { TraceEvent } from "../types/events";
import { phaseMarkers, type TimelinePhase } from "./phases";
import { STAGE_TO_STATION, type StationId } from "./stations";

// Fixed dwell per phase (Q1). A single configurable constant — predictable,
// independent of model latency variability.
export const TOUR_PACE_MS = 3500;

/** One narrated stop on the tour. Carries only what the driver needs to apply. */
export interface TourStep {
  cursor: number; // event index the playhead jumps to (the phase's first event)
  station: StationId; // station to open in the Inspector for this phase
  phase: TimelinePhase; // which phase — drives the caption
}

export type TourStatus = "idle" | "playing" | "paused" | "done";

export interface TourState {
  steps: TourStep[];
  index: number; // current step (-1 when idle)
  status: TourStatus;
}

export const IDLE_TOUR: TourState = { steps: [], index: -1, status: "idle" };

/**
 * The ordered tour stops for a trace — one per occurring phase, in run order.
 * `cursor` is the phase's first event; `station` is the station that owns that
 * event's stage (the single source of truth, `STAGE_TO_STATION`).
 */
export function tourSteps(events: TraceEvent[]): TourStep[] {
  return phaseMarkers(events).map((m) => ({
    cursor: m.index,
    station: STAGE_TO_STATION[events[m.index].stage],
    phase: m.phase,
  }));
}

/** Start a tour over `events`; an empty/replay-less trace stays idle (AC5). */
export function beginTour(events: TraceEvent[]): TourState {
  const steps = tourSteps(events);
  return steps.length ? { steps, index: 0, status: "playing" } : IDLE_TOUR;
}

/**
 * Advance one phase (a timer tick). Paused/idle/done states are inert (AC3); at
 * the last phase the tour stops itself rather than overrunning (AC4).
 */
export function tourStep(state: TourState): TourState {
  if (state.status !== "playing") return state;
  if (state.index >= state.steps.length - 1) return { ...state, status: "done" };
  return { ...state, index: state.index + 1 };
}

export function pauseTour(state: TourState): TourState {
  return state.status === "playing" ? { ...state, status: "paused" } : state;
}

export function resumeTour(state: TourState): TourState {
  return state.status === "paused" ? { ...state, status: "playing" } : state;
}

/** Stop the tour and clear its state (AC3 — hands control back). */
export function stopTour(): TourState {
  return IDLE_TOUR;
}

/** The step the tour is currently on, or null when idle. */
export function currentStep(state: TourState): TourStep | null {
  return state.steps[state.index] ?? null;
}

/** True while the tour owns the playhead (playing or paused). */
export function isTouring(state: TourState): boolean {
  return state.status === "playing" || state.status === "paused";
}

// --- i18n (cached per language) ----------------------------------------------

const captionsCache: Partial<Record<Lang, Record<TimelinePhase, string>>> = {};
const narrationCache: Partial<Record<Lang, Record<TimelinePhase, string>>> = {};
const labelsCache: Partial<Record<Lang, Strings_tour>> = {};

type Strings_tour = (typeof UI)[Lang]["tour"];

/** Per-phase narration captions for a language (stable reference per language). */
export function tourCaptionsFor(lang: Lang): Record<TimelinePhase, string> {
  return (captionsCache[lang] ??= UI[lang].tour.captions);
}

/**
 * Longer, scripted balloon narration per phase (014-tour-scripted) — the prose
 * anchored next to the station each tour stop emphasizes. Stable per language.
 */
export function tourNarrationFor(lang: Lang): Record<TimelinePhase, string> {
  return (narrationCache[lang] ??= UI[lang].tour.narration);
}

/** Tour control labels (start / pause / resume / stop) for a language. */
export function tourLabelsFor(lang: Lang): Strings_tour {
  return (labelsCache[lang] ??= UI[lang].tour);
}
