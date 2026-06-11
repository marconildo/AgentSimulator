// Maturity-ladder scenario (008-scenario-framework). A GLOBAL app mode — one
// selection for the whole app — that picks how much of a production pipeline the
// visualizer shows: `simple` (today), `intermediate` and `advanced`. Mirrors the
// cloud/theme stores: a tiny Zustand store persisted to localStorage.
//
// Only `simple` executes today; the upper rungs are non-executing preview
// topologies (you can view their diagram, but `canSend` gates the send button so
// nothing fakes a run). `available` here mirrors the backend `/api/config`
// `scenarios[].available` flag — when a later spec (009+) lights up a rung, flip
// it in both places.

import { create } from "zustand";

export type Scenario = "simple" | "intermediate" | "advanced";

/** Run order of the ladder (simple → advanced). */
export const SCENARIO_ORDER: Scenario[] = ["simple", "intermediate", "advanced"];

/** Which rungs actually execute. Mirrors backend `/api/config`. */
const AVAILABLE: Record<Scenario, boolean> = {
  simple: true,
  // 054-rag-block-expansion lit up the first real Intermediate node (a local
  // cross-encoder reranker on the RAG path), so the rung now executes.
  intermediate: true,
  advanced: false,
};

/** True only for rungs that execute — the send button is gated on this. */
export function canSend(scenario: Scenario): boolean {
  return AVAILABLE[scenario];
}

const STORAGE_KEY = "agentsim.scenario";
const DEFAULT_SCENARIO: Scenario = "simple";

export function isScenario(v: unknown): v is Scenario {
  return v === "simple" || v === "intermediate" || v === "advanced";
}

function initialScenario(): Scenario {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isScenario(saved)) return saved;
  }
  return DEFAULT_SCENARIO;
}

interface ScenarioState {
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
}

export const useScenario = create<ScenarioState>((set) => ({
  scenario: initialScenario(),
  setScenario: (scenario) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, scenario);
    set({ scenario });
  },
}));
