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

beforeEach(() => {
  useExperiment.setState({ byConv: {} });
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
