// 006-interactive-experiments — the per-conversation experiment store.
// 043-persisted-agent shrank `ConvExperiment` to two fields (the remaining
// per-run knobs that aren't part of the agent's identity): `topK` (a
// retrieval knob, request-only) and `simulateFailure` (017). The 042 agent
// fields (system_prompt, agent_prompt, model, enabled_tools) moved to the
// SQLite `agents` table; this module no longer carries them.
//
// These tests pin AC7 (per-conversation isolation + draft adoption) and the
// override-building used by useChat.send for the two surviving fields.

import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_EXPERIMENT,
  DRAFT_KEY,
  overridesFor,
  useExperiment,
} from "./experiment";
import {
  type ComponentId,
  type RetrievalStrategy,
  type Runtime,
  useSelection,
} from "./selection";

function setSelection(
  enabled: ComponentId[],
  runtime: Runtime = "react",
  retrieval: RetrievalStrategy = "vector",
) {
  useSelection.setState({ enabled: new Set(enabled), runtime, retrieval });
}

beforeEach(() => {
  useExperiment.setState({ byConv: {} });
  setSelection(["mcp"], "react", "vector");
});

describe("useExperiment", () => {
  it("defaults to unsent sentinels", () => {
    expect(useExperiment.getState().getFor("conv-a")).toEqual(DEFAULT_EXPERIMENT);
    expect(overridesFor("conv-a")).toEqual({});
  });

  it("keeps top_k isolated per conversation (AC7)", () => {
    const { setTopK, getFor } = useExperiment.getState();
    setTopK("a", 7);
    expect(getFor("b")).toEqual(DEFAULT_EXPERIMENT);
    expect(getFor("a").topK).toBe(7);
    expect(overridesFor("a")).toEqual({ top_k: 7 });
  });

  it("adopts a draft's settings onto a newly-persisted conversation (AC7)", () => {
    const { setTopK, adopt, getFor } = useExperiment.getState();
    setTopK(null, 5); // draft bucket
    expect(getFor(null).topK).toBe(5);
    adopt(null, "real-id");
    expect(getFor("real-id").topK).toBe(5);
    expect(useExperiment.getState().byConv[DRAFT_KEY]).toBeUndefined();
  });

  it("resets a conversation back to defaults", () => {
    const { setTopK, reset, getFor } = useExperiment.getState();
    setTopK("a", 2);
    expect(overridesFor("a")).toEqual({ top_k: 2 });
    reset("a");
    expect(getFor("a")).toEqual(DEFAULT_EXPERIMENT);
    expect(overridesFor("a")).toEqual({});
  });

  // 061-scenario-builder — the global component selection rides along in the chat
  // overrides as per-feature inputs (rerank/runtime/ragless), so the backend runs the
  // composed pipeline. The default (Simple-equivalent) selection sends nothing extra.
  describe("builder per-feature overrides (061)", () => {
    it("omits rerank/runtime on the default selection (sends nothing extra)", () => {
      setSelection(["mcp"], "react");
      expect(overridesFor("a")).toEqual({});
    });

    it("sends rerank=true when the reranker component is selected", () => {
      setSelection(["mcp", "rerank"], "react");
      expect(overridesFor("a").rerank).toBe(true);
    });

    it("sends the runtime once away from react", () => {
      setSelection(["mcp"], "deepagents");
      expect(overridesFor("a").runtime).toBe("deepagents");
      setSelection(["mcp"], "multiagent");
      expect(overridesFor("a").runtime).toBe("multiagent");
    });
  });

  // 055-rerank-score-threshold — per-conversation min rerank score; sent only when raised.
  describe("rerankThreshold (055)", () => {
    it("omits the field by default and at 0 (no filtering, today's behavior)", () => {
      expect(overridesFor("a").rerank_threshold).toBeUndefined();
      useExperiment.getState().setRerankThreshold("a", 0);
      expect(overridesFor("a").rerank_threshold).toBeUndefined();
    });

    it("sends rerank_threshold once raised above 0, isolated per conversation", () => {
      useExperiment.getState().setRerankThreshold("a", 0.35);
      expect(overridesFor("a").rerank_threshold).toBe(0.35);
      expect(overridesFor("b").rerank_threshold).toBeUndefined();
    });
  });

  // 056-ragless-pageindex → 061 → 066-retrieval-strategy-radio — RAGLESS is now the
  // global retrieval-strategy radio, not a per-conversation toggle. Sent only when the
  // active strategy is `ragless`.
  describe("ragless (056/061/066)", () => {
    it("defaults off and omits the field from overrides (byte-for-byte)", () => {
      expect(overridesFor("a").ragless).toBeUndefined();
    });

    it("sends ragless once the RAGLESS strategy is selected", () => {
      setSelection(["mcp"], "react", "ragless");
      expect(overridesFor("a").ragless).toBe(true);
    });
  });

  // 017-failure-injection — the per-conversation failure selector.
  describe("simulateFailure", () => {
    it("defaults to none and omits the field from overrides (AC1)", () => {
      expect(useExperiment.getState().getFor("a").simulateFailure).toBe("none");
      expect(overridesFor("a").simulate_failure).toBeUndefined();
    });

    it("emits simulate_failure only when set away from none (AC1)", () => {
      const { setSimulateFailure } = useExperiment.getState();
      setSimulateFailure("a", "tool_error");
      expect(overridesFor("a").simulate_failure).toBe("tool_error");
      setSimulateFailure("a", "llm_timeout");
      expect(overridesFor("a").simulate_failure).toBe("llm_timeout");
      // Back to none ⇒ field omitted again (today's behavior).
      setSimulateFailure("a", "none");
      expect(overridesFor("a").simulate_failure).toBeUndefined();
    });

    it("persists until toggled back and stays per-conversation (AC4)", () => {
      const { setSimulateFailure, getFor } = useExperiment.getState();
      setSimulateFailure("a", "llm_timeout");
      expect(getFor("a").simulateFailure).toBe("llm_timeout"); // persists
      expect(getFor("b").simulateFailure).toBe("none"); // isolated
    });
  });
});
