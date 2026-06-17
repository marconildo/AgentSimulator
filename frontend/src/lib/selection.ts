// 061-scenario-builder — the à-la-carte component selection that REPLACES the 008
// maturity ladder (`lib/scenario.ts`) and the 059 track filter (`lib/track.ts`).
//
// Instead of picking one closed rung (simple|intermediate|advanced) or one theme,
// the user composes an architecture by toggling individual components on/off. The
// canvas renders exactly the selected set; the maturity rung becomes a DERIVED label
// (`classify`), never an input. A fixed skeleton (frontend/backend/agent/llm/database)
// is always present — any agent run needs it. `mcp` is optional, default-on, so the
// default selection reproduces today's Simple set byte-for-byte.
//
// 066-retrieval-strategy-radio — retrieval is a RADIO, not two checkboxes: exactly one
// of `vector` (Vector RAG) or `ragless` (RAGLESS / PageIndex) is active at any time
// (they are alternative grounding strategies, like the runtime). `rag` and `ragless`
// are therefore NOT toggleable components — the strategy maps to the `rag` or
// `pageindex` station, and the reranker/hybrid (vector-only sub-features) are gated on
// the strategy being `vector`.
//
// Real, executing components (mcp · rerank · the deepagents runtime) and both retrieval
// strategies change the run via per-feature request inputs (`requestInputs`). Preview
// components (hybrid · summarization · the AI-Ops cluster · the multiagent runtime) are
// `comingSoon` nodes that only draw a labelled box — they never execute (§3).
//
// Selection is GLOBAL (one app-wide choice, persisted to localStorage), mirroring the
// scenario/track stores it replaces. A tiny Zustand store, like cloud/lang.

import { useMemo } from "react";
import { create } from "zustand";

import type { StationId } from "./stations";

export type Runtime = "react" | "deepagents" | "multiagent";
export type Maturity = "simple" | "intermediate" | "advanced";

/** The retrieval strategy radio (066): exactly one is active. */
export type RetrievalStrategy = "vector" | "ragless";

/** Toggleable components, beyond the always-on skeleton + the runtime & retrieval radios. */
export type ComponentId =
  | "mcp" // MCP Tools (optional base, default-on)
  | "rerank" // RAG reranker (real; sub-stage, no station of its own; vector-only)
  | "hybrid" // Hybrid search (preview; vector-only)
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
  mcp: "mcp",
  hybrid: "hybrid",
  summarization: "summarization",
  gateway: "gateway",
  guardrails: "guardrails",
  cache: "cache",
  eval: "eval",
  observability: "observability",
};

/** Retrieval strategy → the station it shows (066). */
const RETRIEVAL_STATION: Record<RetrievalStrategy, StationId> = {
  vector: "rag",
  ragless: "pageindex",
};

export const ALL_COMPONENTS: readonly ComponentId[] = [
  "mcp",
  "rerank",
  "hybrid",
  "summarization",
  "gateway",
  "guardrails",
  "cache",
  "eval",
  "observability",
];

export const RUNTIMES: readonly Runtime[] = ["react", "deepagents", "multiagent"];

/** The retrieval strategy radio options (066), in display order. */
export const RETRIEVAL_STRATEGIES: readonly RetrievalStrategy[] = ["vector", "ragless"];

// Fundamental components: always on, never toggleable (shown checked + locked in the
// palette). MCP Tools (the tool service) is core to the agent, so the builder keeps it
// on — `toggle` ignores it and `resolveStations` always includes its station.
// (Retrieval is the radio above, not a locked component.)
export const LOCKED_COMPONENTS: readonly ComponentId[] = ["mcp"];
const LOCKED = new Set<ComponentId>(LOCKED_COMPONENTS);

export function isLocked(id: ComponentId): boolean {
  return LOCKED.has(id);
}

/** Whether a component executes for real (vs a non-running `comingSoon` preview). */
export const COMPONENT_IS_REAL: Record<ComponentId, boolean> = {
  mcp: true,
  rerank: true,
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

/** Both retrieval strategies execute for real (066). */
export const RETRIEVAL_IS_REAL: Record<RetrievalStrategy, boolean> = {
  vector: true,
  ragless: true,
};

// Maturity floor per component / runtime / strategy — the lowest rung that element
// belongs to (resolved decision: mirrors the station `scenarios[]` membership; `rerank`
// has no station and the runtimes/strategies are pinned here). `classify` takes the
// highest floor across the selection.
const COMPONENT_FLOOR: Record<ComponentId, Maturity> = {
  mcp: "simple",
  rerank: "intermediate",
  hybrid: "intermediate",
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

const RETRIEVAL_FLOOR: Record<RetrievalStrategy, Maturity> = {
  vector: "simple",
  ragless: "intermediate",
};

/** Components that require Vector RAG to be the active retrieval strategy (066). */
export const REQUIRES_VECTOR: ReadonlySet<ComponentId> = new Set<ComponentId>(["rerank", "hybrid"]);

const MATURITY_RANK: Record<Maturity, number> = { simple: 0, intermediate: 1, advanced: 2 };

// --- Pure helpers (operate on a raw selection, so they're trivially testable) ----

/** Whether a component's dependency (vector-only sub-feature) is met by the strategy. */
export function dependencyMet(retrieval: RetrievalStrategy, id: ComponentId): boolean {
  return !REQUIRES_VECTOR.has(id) || retrieval === "vector";
}

/** The set of stations the canvas shows for a selection (skeleton + enabled + retrieval + subagents). */
export function resolveStations(
  enabled: ReadonlySet<ComponentId>,
  runtime: Runtime,
  retrieval: RetrievalStrategy,
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
  // Exactly one retrieval station, per the strategy radio.
  ids.add(RETRIEVAL_STATION[retrieval]);
  if (runtime === "multiagent") for (const s of SUBAGENT_STATIONS) ids.add(s);
  return ids;
}

/** The derived maturity badge — the highest floor across the selection. */
export function classify(
  enabled: ReadonlySet<ComponentId>,
  runtime: Runtime,
  retrieval: RetrievalStrategy,
): Maturity {
  let rank = Math.max(MATURITY_RANK[RUNTIME_FLOOR[runtime]], MATURITY_RANK[RETRIEVAL_FLOOR[retrieval]]);
  for (const c of enabled) rank = Math.max(rank, MATURITY_RANK[COMPONENT_FLOOR[c]]);
  return (Object.keys(MATURITY_RANK) as Maturity[]).find((m) => MATURITY_RANK[m] === rank)!;
}

/** The per-feature request inputs the backend reads (061 replaced the scenario enum). */
export function requestInputs(
  enabled: ReadonlySet<ComponentId>,
  runtime: Runtime,
  retrieval: RetrievalStrategy,
): { rerank: boolean; runtime: Runtime; ragless: boolean } {
  return {
    // Rerank only rides Vector RAG — it cannot apply to the reasoning-based path (066).
    rerank: retrieval === "vector" && enabled.has("rerank"),
    runtime,
    ragless: retrieval === "ragless",
  };
}

// --- The global store (persisted to localStorage) --------------------------------

const STORAGE_KEY = "agentsim.selection";
const DEFAULT_ENABLED: ComponentId[] = ["mcp"];
const DEFAULT_RUNTIME: Runtime = "react";
const DEFAULT_RETRIEVAL: RetrievalStrategy = "vector";

function isComponentId(v: unknown): v is ComponentId {
  return typeof v === "string" && (ALL_COMPONENTS as readonly string[]).includes(v);
}
function isRuntime(v: unknown): v is Runtime {
  return v === "react" || v === "deepagents" || v === "multiagent";
}
function isRetrieval(v: unknown): v is RetrievalStrategy {
  return v === "vector" || v === "ragless";
}

/** Ensure the fundamental (locked) components are always present in the enabled set. */
function withLocked(enabled: ComponentId[]): ComponentId[] {
  const out = enabled.filter((c) => !LOCKED.has(c));
  return [...LOCKED_COMPONENTS, ...out];
}

export function loadSelection(): {
  enabled: ComponentId[];
  runtime: Runtime;
  retrieval: RetrievalStrategy;
} {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          enabled?: unknown;
          runtime?: unknown;
          retrieval?: unknown;
        };
        const rawEnabled = Array.isArray(parsed.enabled) ? parsed.enabled : null;
        const enabled = rawEnabled ? rawEnabled.filter(isComponentId) : null;
        // A stale/preview runtime (e.g. `multiagent`, not yet implemented) must never
        // resurrect into the live state — fall back to the default real runtime.
        const runtime =
          isRuntime(parsed.runtime) && RUNTIME_IS_REAL[parsed.runtime]
            ? parsed.runtime
            : DEFAULT_RUNTIME;
        // 066 migration: a pre-066 blob has no `retrieval` field and lists `rag`/`ragless`
        // in `enabled`. Map the legacy `ragless` membership into the strategy radio (it was
        // already filtered out of `enabled` by `isComponentId`, since it's no longer one).
        const retrieval = isRetrieval(parsed.retrieval)
          ? parsed.retrieval
          : rawEnabled?.includes("ragless")
            ? "ragless"
            : DEFAULT_RETRIEVAL;
        if (enabled) return { enabled: withLocked(enabled), runtime, retrieval };
      }
    } catch {
      // fall through to default
    }
  }
  return { enabled: [...DEFAULT_ENABLED], runtime: DEFAULT_RUNTIME, retrieval: DEFAULT_RETRIEVAL };
}

function persist(
  enabled: ReadonlySet<ComponentId>,
  runtime: Runtime,
  retrieval: RetrievalStrategy,
): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: [...enabled], runtime, retrieval }));
  }
}

interface SelectionStore {
  enabled: Set<ComponentId>;
  runtime: Runtime;
  retrieval: RetrievalStrategy;
  /** Flip a component, enforcing the vector-only dependency for rerank/hybrid. */
  toggle: (id: ComponentId) => void;
  /** Pick the agent runtime (a radio — replaces the previous one). */
  setRuntime: (runtime: Runtime) => void;
  /** Pick the retrieval strategy (a radio). Switching off vector clears vector-only subs. */
  setRetrieval: (retrieval: RetrievalStrategy) => void;
  /** Whether the UI should allow toggling `id` on (dependency met). Always allows off. */
  canToggle: (id: ComponentId) => boolean;
}

export const useSelection = create<SelectionStore>((set, get) => {
  const init = loadSelection();
  return {
    enabled: new Set(init.enabled),
    runtime: init.runtime,
    retrieval: init.retrieval,

    toggle: (id) =>
      set((s) => {
        if (LOCKED.has(id)) return {}; // fundamental — never toggleable
        const next = new Set(s.enabled);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (!dependencyMet(s.retrieval, id)) return {}; // guarded; UI disables this anyway
          next.add(id);
        }
        persist(next, s.runtime, s.retrieval);
        return { enabled: next };
      }),

    setRuntime: (runtime) =>
      set((s) => {
        // Only implemented runtimes are selectable — a preview runtime (e.g.
        // `multiagent`) must never become the active runtime, or a user could send a
        // message claiming a runtime that doesn't actually execute. The UI disables it
        // too; this is the guard of record.
        if (!RUNTIME_IS_REAL[runtime]) return {};
        persist(s.enabled, runtime, s.retrieval);
        return { runtime };
      }),

    setRetrieval: (retrieval) =>
      set((s) => {
        if (retrieval === s.retrieval) return {};
        // Switching away from Vector RAG clears the vector-only sub-features (rerank,
        // hybrid) — they cannot ride the reasoning-based path (066 AC5).
        const next = new Set(s.enabled);
        if (retrieval !== "vector") for (const c of REQUIRES_VECTOR) next.delete(c);
        persist(next, s.runtime, retrieval);
        return { enabled: next, retrieval };
      }),

    canToggle: (id) => (get().enabled.has(id) ? true : dependencyMet(get().retrieval, id)),
  };
});

// --- Selectors over the live store, for consumers (canvas, request builder) ------

/** The resolved selection the canvas/layout consume. */
export interface ResolvedSelection {
  stations: ReadonlySet<StationId>;
  runtime: Runtime;
}

export function resolvedSelection(): ResolvedSelection {
  const { enabled, runtime, retrieval } = useSelection.getState();
  return { stations: resolveStations(enabled, runtime, retrieval), runtime };
}

/** Build a resolved selection from a raw component list — handy for tests/callers. */
export function selectionOf(
  enabled: ComponentId[],
  runtime: Runtime = "react",
  retrieval: RetrievalStrategy = "vector",
): ResolvedSelection {
  return { stations: resolveStations(new Set(enabled), runtime, retrieval), runtime };
}

/** The default selection (today's Simple set + ReAct + Vector RAG) — the baseline. */
export const DEFAULT_SELECTION: ResolvedSelection = selectionOf(["mcp"], "react", "vector");

/** Reactive variant for React components — recomputes when the selection changes. */
export function useResolvedSelection(): ResolvedSelection {
  const enabled = useSelection((s) => s.enabled);
  const runtime = useSelection((s) => s.runtime);
  const retrieval = useSelection((s) => s.retrieval);
  return useMemo(
    () => ({ stations: resolveStations(enabled, runtime, retrieval), runtime }),
    [enabled, runtime, retrieval],
  );
}

/** Reactive derived maturity badge for React components. */
export function useMaturity(): Maturity {
  const enabled = useSelection((s) => s.enabled);
  const runtime = useSelection((s) => s.runtime);
  const retrieval = useSelection((s) => s.retrieval);
  return useMemo(() => classify(enabled, runtime, retrieval), [enabled, runtime, retrieval]);
}

export function currentRequestInputs(): { rerank: boolean; runtime: Runtime; ragless: boolean } {
  const { enabled, runtime, retrieval } = useSelection.getState();
  return requestInputs(enabled, runtime, retrieval);
}

export function currentMaturity(): Maturity {
  const { enabled, runtime, retrieval } = useSelection.getState();
  return classify(enabled, runtime, retrieval);
}
