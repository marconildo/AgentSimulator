import { beforeEach, describe, expect, it } from "vitest";

import {
  type ComponentId,
  classify,
  dependencyMet,
  isLocked,
  loadSelection,
  requestInputs,
  resolveStations,
  useSelection,
} from "./selection";

const set = (ids: ComponentId[]) => new Set(ids);

// Today's Simple station set (the byte-for-byte baseline the default must reproduce).
const SIMPLE_STATIONS = ["frontend", "backend", "agent", "llm", "database", "rag", "mcp"];

describe("selection model (061-scenario-builder / 066-retrieval-strategy-radio)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the store to its loaded default between tests.
    useSelection.setState({ enabled: set(["mcp"]), runtime: "react", retrieval: "vector" });
  });

  it("AC2 — the default selection reproduces today's Simple set + inputs", () => {
    const enabled = set(["mcp"]);
    expect([...resolveStations(enabled, "react", "vector")].sort()).toEqual(
      [...SIMPLE_STATIONS].sort(),
    );
    expect(classify(enabled, "react", "vector")).toBe("simple");
    expect(requestInputs(enabled, "react", "vector")).toEqual({
      rerank: false,
      runtime: "react",
      ragless: false,
    });
  });

  it("AC1 — retrieval is a radio: exactly one strategy active, switching flips it", () => {
    const s = useSelection.getState();
    expect(useSelection.getState().retrieval).toBe("vector");
    s.setRetrieval("ragless");
    expect(useSelection.getState().retrieval).toBe("ragless");
    s.setRetrieval("vector");
    expect(useSelection.getState().retrieval).toBe("vector");
  });

  it("AC4 — the strategy picks exactly one of the rag / pageindex stations", () => {
    const vector = resolveStations(set(["mcp"]), "react", "vector");
    expect(vector.has("rag")).toBe(true);
    expect(vector.has("pageindex")).toBe(false);

    const ragless = resolveStations(set(["mcp"]), "react", "ragless");
    expect(ragless.has("pageindex")).toBe(true);
    expect(ragless.has("rag")).toBe(false);
  });

  it("AC3 — request inputs reflect the strategy; rerank only rides vector", () => {
    expect(requestInputs(set(["mcp"]), "react", "ragless")).toEqual({
      rerank: false,
      runtime: "react",
      ragless: true,
    });
    expect(requestInputs(set(["mcp", "rerank"]), "deepagents", "vector")).toEqual({
      rerank: true,
      runtime: "deepagents",
      ragless: false,
    });
    // Even if rerank somehow lingers in the set, a non-vector strategy never sends it.
    expect(requestInputs(set(["mcp", "rerank"]), "react", "ragless").rerank).toBe(false);
  });

  it("AC5 — rerank/hybrid require Vector RAG; switching to ragless clears them", () => {
    // Dependency is on the strategy, not a component.
    expect(dependencyMet("ragless", "rerank")).toBe(false);
    expect(dependencyMet("ragless", "hybrid")).toBe(false);
    expect(dependencyMet("vector", "rerank")).toBe(true);

    useSelection.setState({ enabled: set(["mcp", "rerank"]), runtime: "react", retrieval: "vector" });
    expect(useSelection.getState().canToggle("rerank")).toBe(true); // already on → can turn off
    // Switch to ragless: rerank/hybrid are no longer toggleable on, and rerank is cleared.
    useSelection.getState().setRetrieval("ragless");
    expect(useSelection.getState().enabled.has("rerank")).toBe(false);
    expect(useSelection.getState().canToggle("rerank")).toBe(false);
    expect(useSelection.getState().canToggle("hybrid")).toBe(false);
  });

  it("AC3 (maturity) — maturity is derived as the highest floor in the selection", () => {
    expect(classify(set(["mcp"]), "react", "vector")).toBe("simple");
    expect(classify(set(["mcp", "rerank"]), "react", "vector")).toBe("intermediate");
    expect(classify(set(["mcp", "summarization"]), "react", "vector")).toBe("intermediate");
    expect(classify(set(["mcp"]), "react", "ragless")).toBe("intermediate");
    expect(classify(set(["mcp"]), "deepagents", "vector")).toBe("intermediate");
    expect(classify(set(["mcp", "gateway"]), "react", "vector")).toBe("advanced");
    expect(classify(set(["mcp"]), "multiagent", "vector")).toBe("advanced");
  });

  it("runtime is a radio; only implemented (real) runtimes are selectable", () => {
    const s = useSelection.getState();
    s.setRuntime("deepagents");
    expect(useSelection.getState().runtime).toBe("deepagents");
    s.setRuntime("multiagent");
    expect(useSelection.getState().runtime).toBe("deepagents");
    const stations = resolveStations(set(["mcp"]), "multiagent", "vector");
    expect(stations.has("researcher")).toBe(true);
    expect(stations.has("coder")).toBe(true);
    expect(stations.has("critic")).toBe(true);
    expect(resolveStations(set(["mcp"]), "react", "vector").has("researcher")).toBe(false);
  });

  it("a stale persisted non-real runtime falls back to the default real runtime", () => {
    localStorage.setItem(
      "agentsim.selection",
      JSON.stringify({ enabled: ["mcp"], runtime: "multiagent", retrieval: "vector" }),
    );
    expect(loadSelection().runtime).toBe("react");
  });

  it("migration — a pre-066 blob with ragless in enabled loads as the ragless strategy", () => {
    localStorage.setItem(
      "agentsim.selection",
      JSON.stringify({ enabled: ["rag", "mcp", "ragless"], runtime: "react" }),
    );
    const loaded = loadSelection();
    expect(loaded.retrieval).toBe("ragless");
    // `rag`/`ragless` are no longer components — stripped from enabled.
    expect(loaded.enabled).not.toContain("rag");
    expect(loaded.enabled).not.toContain("ragless");
    expect(loaded.enabled).toContain("mcp");
  });

  it("migration — a pre-066 blob without ragless defaults to the vector strategy", () => {
    localStorage.setItem(
      "agentsim.selection",
      JSON.stringify({ enabled: ["rag", "mcp", "rerank"], runtime: "react" }),
    );
    expect(loadSelection().retrieval).toBe("vector");
  });

  it("mcp is fundamental — locked on and not toggleable", () => {
    expect(isLocked("mcp")).toBe(true);
    expect(isLocked("rerank")).toBe(false);

    useSelection.setState({ enabled: set(["mcp"]), runtime: "react", retrieval: "vector" });
    useSelection.getState().toggle("mcp");
    expect(useSelection.getState().enabled.has("mcp")).toBe(true);

    // mcp always renders even if a stale state somehow omits it; vector strategy adds rag.
    const stations = resolveStations(set([]), "react", "vector");
    expect(stations.has("mcp")).toBe(true);
    expect(stations.has("rag")).toBe(true);
  });

  it("persists the selection (incl. retrieval) to localStorage", () => {
    useSelection.getState().toggle("gateway");
    const raw = localStorage.getItem("agentsim.selection");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).enabled).toContain("gateway");
    useSelection.getState().setRetrieval("ragless");
    expect(JSON.parse(localStorage.getItem("agentsim.selection")!).retrieval).toBe("ragless");
  });
});
