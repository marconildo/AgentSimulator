// Scenario tracks (themes) — 059-scenario-tracks. A SECOND, optional axis crossing
// the 008 maturity ladder. The rung (`simple|intermediate|advanced`) answers "how
// much of a production pipeline?"; a Track answers "which subsystem am I studying?"
// and narrows the *preview* clusters within a rung — so the Advanced rung stops
// being a wall of tiles.
//
// A Track is a CLIENT-SIDE VIEW FILTER ONLY: it is never sent to the backend and
// never changes execution. The load-bearing safety rule (enforced in stations.ts)
// is that a track may hide a node only if it is `comingSoon`; real/executing and
// untagged base nodes are always shown. So Simple stays byte-for-byte and the
// projection/totality invariants are untouched.
//
// Mirrors the cloud/scenario/theme stores: a tiny Zustand store persisted to
// localStorage, defaulting to `all`.

import { create } from "zustand";

// `all` is the "show everything" filter value (the default). The other five are
// the **themes** — the values a node's `tracks` membership may contain.
export type Track = "all" | "rag" | "agent" | "aiops" | "security" | "scale";

/** Selector order (all first, then the five themes). */
export const TRACK_ORDER: Track[] = ["all", "rag", "agent", "aiops", "security", "scale"];

/**
 * The five themes (every non-`all` track) — the default membership for a node
 * that carries no explicit `tracks` (a cross-cutting base node belongs to all
 * themes, so no track ever hides it).
 */
export const ALL_TRACKS: Track[] = ["rag", "agent", "aiops", "security", "scale"];

const STORAGE_KEY = "agentsim.track";
const DEFAULT_TRACK: Track = "all";

export function isTrack(v: unknown): v is Track {
  return typeof v === "string" && (TRACK_ORDER as string[]).includes(v);
}

function initialTrack(): Track {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTrack(saved)) return saved;
  }
  return DEFAULT_TRACK;
}

interface TrackState {
  track: Track;
  setTrack: (track: Track) => void;
}

export const useTrack = create<TrackState>((set) => ({
  track: initialTrack(),
  setTrack: (track) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, track);
    set({ track });
  },
}));
