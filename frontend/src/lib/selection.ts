// 061-scenario-builder — the à-la-carte component selection that REPLACES the 008
// maturity ladder (`lib/scenario.ts`) and the 059 track filter (`lib/track.ts`).
//
// Instead of picking one closed rung (simple|intermediate|advanced) or one theme,
// the user composes an architecture by toggling individual components on/off. The
// canvas renders exactly the selected set; the maturity rung becomes a DERIVED label
// (`classify`), never an input. A fixed skeleton (frontend/backend/agent/llm/database)
// is always present — any agent run needs it. `rag` + `mcp` are optional, default-on,
// so the default selection reproduces today's Simple set byte-for-byte.
//
// Real, executing components (rag · mcp · rerank · ragless · the deepagents runtime)
// change the run via per-feature request inputs (`requestInputs`). Preview components
// (hybrid · summarization · the AI-Ops cluster · the multiagent runtime) are
// `comingSoon` nodes that only draw a labelled box — they never execute (§3).
//
// Selection is GLOBAL (one app-wide choice, persisted to localStorage), mirroring the
// scenario/track stores it replaces. A tiny Zustand store, like cloud/lang.

import { useMemo } from "react";
import { create } from "zustand";

import type { StationId } from "./stations";

export type Runtime = "react" | "deepagents" | "multiagent";
export type Maturity = "simple" | "intermediate" | "advanced";

/** Toggleable components, beyond the always-on skeleton + the runtime radio. */
export type ComponentId =
  | "rag" // Vector RAG (optional base, default-on)
  | "mcp" // MCP Tools (optional base, default-on)
  | "rerank" // RAG reranker (real; sub-stage, no station of its own)
  | "hybrid" // Hybrid search (preview)
  | "ragless" // RAGLESS / PageIndex (real alternative retrieval; station `pageindex`)
  | "summarization" // context compaction (preview)
  | "gateway"
  | "guardrails"
  | "cache"
  | "eval"
  | "observability";

/** The fixed real skeleton — always visible, never toggleable. */
export const SKELETON: readonly StationId[] = ["frontend", "backend", "agent", "llm", "database"];

/** The Advanced-rung sub-agent stations revealed by the `multiagent` runtime. */
const SUBAGENT_STATIONS: readonly StationId[] = ["researcher", "coder", "critic"];

/** Component → the station it shows (omitted for `rerank`, which is a sub-stage). */
const COMPONENT_STATION: Partial<Record<ComponentId, StationId>> = {
  rag: "rag",
  mcp: "mcp",
  hybrid: "hybrid",
  ragless: "pageindex",
  summarization: "summarization",
  gateway: "gateway",
  guardrails: "guardrails",
  cache: "cache",
  eval: "eval",
  observability: "observability",
};

export const ALL_COMPONENTS: readonly ComponentId[] = [
  "rag",
  "mcp",
  "rerank",
  "hybrid",
  "ragless",
  "summarization",
  "gateway",
  "guardrails",
  "cache",
  "eval",
  "observability",
];

export const RUNTIMES: readonly Runtime[] = ["react", "deepagents", "multiagent"];

// Fundamental components: always on, never toggleable (shown checked + locked in the
// palette). Vector RAG (grounding) and MCP Tools (the tool service) are core to the
// agent, so the builder keeps them on — `toggle` ignores them and `resolveStations`
// always includes their stations.
export const LOCKED_COMPONENTS: readonly ComponentId[] = ["rag", "mcp"];
const LOCKED = new Set<ComponentId>(LOCKED_COMPONENTS);

export function isLocked(id: ComponentId): boolean {
  return LOCKED.has(id);
}

/** Whether a component executes for real (vs a non-running `comingSoon` preview). */
export const COMPONENT_IS_REAL: Record<ComponentId, boolean> = {
  rag: true,
  mcp: true,
  rerank: true,
  ragless: true,
  hybrid: false,
  summarization: false,
  gateway: false,
  guardrails: false,
  cache: false,
  eval: false,
  observability: false,
};

export const RUNTIME_IS_REAL: Record<Runtime, boolean> = {
  react: true,
  deepagents: true,
  multiagent: false,
};

// Maturity floor per component / runtime — the lowest rung that component belongs to
// (resolved decision: mirrors the station `scenarios[]` membership; `rerank` has no
// station and the runtimes are new, so they are pinned here). `classify` takes the
// highest floor across the selection.
const COMPONENT_FLOOR: Record<ComponentId, Maturity> = {
  rag: "simple",
  mcp: "simple",
  rerank: "intermediate",
  hybrid: "intermediate",
  ragless: "intermediate",
  summarization: "intermediate",
  gateway: "advanced",
  guardrails: "advanced",
  cache: "advanced",
  eval: "advanced",
  observability: "advanced",
};

const RUNTIME_FLOOR: Record<Runtime, Maturity> = {
  react: "simple",
  deepagents: "intermediate",
  multiagent: "advanced",
};

/** Components that require another component to be enabled first (a hard dependency). */
export const REQUIRES: Partial<Record<ComponentId, ComponentId>> = {
  rerank: "rag",
  hybrid: "rag",
};

const MATURITY_RANK: Record<Maturity, number> = { simple: 0, intermediate: 1, advanced: 2 };

// --- Pure helpers (operate on a raw selection, so they're trivially testable) ----

/** Whether a component's hard dependency (if any) is met by the enabled set. */
export function dependencyMet(enabled: ReadonlySet<ComponentId>, id: ComponentId): boolean {
  const req = REQUIRES[id];
  return req === undefined || enabled.has(req);
}

/** The set of stations the canvas shows for a selection (skeleton + enabled + subagents). */
export function resolveStations(
  enabled: ReadonlySet<ComponentId>,
  runtime: Runtime,
): Set<StationId> {
  const ids = new Set<StationId>(SKELETON);
  // Locked components are fundamental — always present regardless of stored state.
  for (const c of LOCKED_COMPONENTS) {
    const station = COMPONENT_STATION[c];
    if (station) ids.add(station);
  }
  for (const c of enabled) {
    const station = COMPONENT_STATION[c];
    if (station) ids.add(station);
  }
  if (runtime === "multiagent") for (const s of SUBAGENT_STATIONS) ids.add(s);
  return ids;
}

/** The derived maturity badge — the highest floor across the selection. */
export function classify(enabled: ReadonlySet<ComponentId>, runtime: Runtime): Maturity {
  let rank = MATURITY_RANK[RUNTIME_FLOOR[runtime]];
  for (const c of enabled) rank = Math.max(rank, MATURITY_RANK[COMPONENT_FLOOR[c]]);
  return (Object.keys(MATURITY_RANK) as Maturity[]).find((m) => MATURITY_RANK[m] === rank)!;
}

/** The per-feature request inputs the backend reads (061 replaced the scenario enum). */
export function requestInputs(
  enabled: ReadonlySet<ComponentId>,
  runtime: Runtime,
): { rerank: boolean; runtime: Runtime; ragless: boolean } {
  return {
    rerank: enabled.has("rerank"),
    runtime,
    ragless: enabled.has("ragless"),
  };
}

// --- The global store (persisted to localStorage) --------------------------------

const STORAGE_KEY = "agentsim.selection";
const DEFAULT_ENABLED: ComponentId[] = ["rag", "mcp"];
const DEFAULT_RUNTIME: Runtime = "react";

function isComponentId(v: unknown): v is ComponentId {
  return typeof v === "string" && (ALL_COMPONENTS as readonly string[]).includes(v);
}
function isRuntime(v: unknown): v is Runtime {
  return v === "react" || v === "deepagents" || v === "multiagent";
}

/** Ensure the fundamental (locked) components are always present in the enabled set. */
function withLocked(enabled: ComponentId[]): ComponentId[] {
  const out = enabled.filter((c) => !LOCKED.has(c));
  return [...LOCKED_COMPONENTS, ...out];
}

function load(): { enabled: ComponentId[]; runtime: Runtime } {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { enabled?: unknown; runtime?: unknown };
        const enabled = Array.isArray(parsed.enabled) ? parsed.enabled.filter(isComponentId) : null;
        const runtime = isRuntime(parsed.runtime) ? parsed.runtime : DEFAULT_RUNTIME;
        if (enabled) return { enabled: withLocked(enabled), runtime };
      }
    } catch {
      // fall through to default
    }
  }
  return { enabled: [...DEFAULT_ENABLED], runtime: DEFAULT_RUNTIME };
}

function persist(enabled: ReadonlySet<ComponentId>, runtime: Runtime): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: [...enabled], runtime }));
  }
}

interface SelectionStore {
  enabled: Set<ComponentId>;
  runtime: Runtime;
  /** Flip a component, enforcing dependencies (removing a base clears its dependents). */
  toggle: (id: ComponentId) => void;
  /** Pick the agent runtime (a radio — replaces the previous one). */
  setRuntime: (runtime: Runtime) => void;
  /** Whether the UI should allow toggling `id` on (dependency met). Always allows off. */
  canToggle: (id: ComponentId) => boolean;
}

export const useSelection = create<SelectionStore>((set, get) => {
  const init = load();
  return {
    enabled: new Set(init.enabled),
    runtime: init.runtime,

    toggle: (id) =>
      set((s) => {
        if (LOCKED.has(id)) return {}; // fundamental — never toggleable
        const next = new Set(s.enabled);
        if (next.has(id)) {
          next.delete(id);
          // Removing a base component clears anything that hard-depends on it (AC5).
          for (const c of ALL_COMPONENTS) if (REQUIRES[c] === id) next.delete(c);
        } else {
          if (!dependencyMet(next, id)) return {}; // guarded; UI disables this anyway
          next.add(id);
        }
        persist(next, s.runtime);
        return { enabled: next };
      }),

    setRuntime: (runtime) =>
      set((s) => {
        persist(s.enabled, runtime);
        return { runtime };
      }),

    canToggle: (id) => (get().enabled.has(id) ? true : dependencyMet(get().enabled, id)),
  };
});

// --- Selectors over the live store, for consumers (canvas, request builder) ------

/** The resolved selection the canvas/layout consume. */
export interface ResolvedSelection {
  stations: ReadonlySet<StationId>;
  runtime: Runtime;
}

export function resolvedSelection(): ResolvedSelection {
  const { enabled, runtime } = useSelection.getState();
  return { stations: resolveStations(enabled, runtime), runtime };
}

/** Build a resolved selection from a raw component list — handy for tests/callers. */
export function selectionOf(enabled: ComponentId[], runtime: Runtime = "react"): ResolvedSelection {
  return { stations: resolveStations(new Set(enabled), runtime), runtime };
}

/** The default selection (today's Simple set + ReAct) — the byte-for-byte baseline. */
export const DEFAULT_SELECTION: ResolvedSelection = selectionOf(["rag", "mcp"], "react");

/** Reactive variant for React components — recomputes when the selection changes. */
export function useResolvedSelection(): ResolvedSelection {
  const enabled = useSelection((s) => s.enabled);
  const runtime = useSelection((s) => s.runtime);
  return useMemo(() => ({ stations: resolveStations(enabled, runtime), runtime }), [enabled, runtime]);
}

/** Reactive derived maturity badge for React components. */
export function useMaturity(): Maturity {
  const enabled = useSelection((s) => s.enabled);
  const runtime = useSelection((s) => s.runtime);
  return useMemo(() => classify(enabled, runtime), [enabled, runtime]);
}

export function currentRequestInputs(): { rerank: boolean; runtime: Runtime; ragless: boolean } {
  const { enabled, runtime } = useSelection.getState();
  return requestInputs(enabled, runtime);
}

export function currentMaturity(): Maturity {
  const { enabled, runtime } = useSelection.getState();
  return classify(enabled, runtime);
}
