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

describe("selection model (061-scenario-builder)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the store to its loaded default between tests.
    useSelection.setState({ enabled: set(["rag", "mcp"]), runtime: "react" });
  });

  it("AC1 — the default selection reproduces today's Simple set + inputs", () => {
    const enabled = set(["rag", "mcp"]);
    expect([...resolveStations(enabled, "react")].sort()).toEqual([...SIMPLE_STATIONS].sort());
    expect(classify(enabled, "react")).toBe("simple");
    expect(requestInputs(enabled, "react")).toEqual({
      rerank: false,
      runtime: "react",
      ragless: false,
    });
  });

  it("AC2 — toggling one component changes exactly that component", () => {
    useSelection.getState().toggle("rerank");
    expect(useSelection.getState().enabled).toEqual(set(["rag", "mcp", "rerank"]));
    useSelection.getState().toggle("rerank");
    expect(useSelection.getState().enabled).toEqual(set(["rag", "mcp"]));
  });

  it("AC3 — maturity is derived as the highest floor in the selection", () => {
    expect(classify(set(["rag", "mcp"]), "react")).toBe("simple");
    expect(classify(set(["rag", "mcp", "rerank"]), "react")).toBe("intermediate");
    expect(classify(set(["rag", "mcp", "summarization"]), "react")).toBe("intermediate");
    expect(classify(set(["rag", "mcp"]), "deepagents")).toBe("intermediate");
    expect(classify(set(["rag", "mcp", "gateway"]), "react")).toBe("advanced");
    expect(classify(set(["rag", "mcp"]), "multiagent")).toBe("advanced");
  });

  it("AC4 — runtime is a radio; only implemented (real) runtimes are selectable", () => {
    const s = useSelection.getState();
    s.setRuntime("deepagents");
    expect(useSelection.getState().runtime).toBe("deepagents");
    // multiagent is a preview runtime (not implemented) — selecting it is a no-op,
    // so the user can never send a message claiming a runtime that doesn't run.
    s.setRuntime("multiagent");
    expect(useSelection.getState().runtime).toBe("deepagents");
    // resolveStations stays a total pure helper (still maps multiagent → sub-agents).
    const stations = resolveStations(set(["rag", "mcp"]), "multiagent");
    expect(stations.has("researcher")).toBe(true);
    expect(stations.has("coder")).toBe(true);
    expect(stations.has("critic")).toBe(true);
    // ReAct shows no sub-agents.
    expect(resolveStations(set(["rag", "mcp"]), "react").has("researcher")).toBe(false);
  });

  it("a stale persisted non-real runtime falls back to the default real runtime", () => {
    localStorage.setItem(
      "agentsim.selection",
      JSON.stringify({ enabled: ["rag", "mcp"], runtime: "multiagent" }),
    );
    expect(loadSelection().runtime).toBe("react");
  });

  it("AC5 — rerank/hybrid declare a rag dependency (always met, rag is locked)", () => {
    expect(dependencyMet(set(["mcp"]), "rerank")).toBe(false);
    expect(dependencyMet(set(["rag"]), "rerank")).toBe(true);
    expect(dependencyMet(set(["mcp"]), "hybrid")).toBe(false);
  });

  it("rag and mcp are fundamental — locked on and not toggleable", () => {
    expect(isLocked("rag")).toBe(true);
    expect(isLocked("mcp")).toBe(true);
    expect(isLocked("rerank")).toBe(false);

    // Toggling a locked component is a no-op — it stays enabled.
    useSelection.setState({ enabled: set(["rag", "mcp"]), runtime: "react" });
    useSelection.getState().toggle("rag");
    expect(useSelection.getState().enabled.has("rag")).toBe(true);
    useSelection.getState().toggle("mcp");
    expect(useSelection.getState().enabled.has("mcp")).toBe(true);

    // They always render even if a stale state somehow omits them.
    const stations = resolveStations(set([]), "react");
    expect(stations.has("rag")).toBe(true);
    expect(stations.has("mcp")).toBe(true);
  });

  it("ragless / runtime drive the per-feature request inputs", () => {
    expect(requestInputs(set(["rag", "mcp", "ragless"]), "react").ragless).toBe(true);
    expect(requestInputs(set(["rag", "mcp", "rerank"]), "deepagents")).toEqual({
      rerank: true,
      runtime: "deepagents",
      ragless: false,
    });
  });

  it("persists the selection to localStorage", () => {
    useSelection.getState().toggle("gateway");
    const raw = localStorage.getItem("agentsim.selection");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).enabled).toContain("gateway");
  });
});
