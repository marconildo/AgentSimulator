// 006-interactive-experiments — the per-conversation experiment store. Settings
// are "unsent" sentinels by default (null ⇒ omit the field ⇒ backend default,
// preserving AC5). These tests pin AC7 (per-conversation isolation + draft
// adoption) and the override-building used by useChat.send.

import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_EXPERIMENT,
  DRAFT_KEY,
  overridesFor,
  useExperiment,
} from "./experiment";

const ALL = ["calculator", "current_time", "kb_lookup"];

beforeEach(() => {
  useExperiment.setState({ byConv: {} });
});

describe("useExperiment", () => {
  it("defaults to unsent sentinels", () => {
    expect(useExperiment.getState().getFor("conv-a")).toEqual(DEFAULT_EXPERIMENT);
    expect(overridesFor("conv-a")).toEqual({});
  });

  it("treats a blank system prompt as no override", () => {
    const { setSystemPrompt, getFor } = useExperiment.getState();
    setSystemPrompt("a", "   ");
    expect(getFor("a").systemPrompt).toBeNull();
    setSystemPrompt("a", "You are a pirate.");
    expect(getFor("a").systemPrompt).toBe("You are a pirate.");
    expect(overridesFor("a").system_prompt).toBe("You are a pirate.");
  });

  it("normalizes all-tools-on back to null (no override)", () => {
    const { toggleTool, getFor } = useExperiment.getState();
    toggleTool("a", "calculator", ALL); // off
    expect(getFor("a").enabledTools).toEqual(["current_time", "kb_lookup"]);
    toggleTool("a", "calculator", ALL); // back on ⇒ all ⇒ null
    expect(getFor("a").enabledTools).toBeNull();
  });

  it("represents all-tools-off as an empty list (still an override)", () => {
    const { toggleTool, getFor } = useExperiment.getState();
    for (const name of ALL) toggleTool("a", name, ALL);
    expect(getFor("a").enabledTools).toEqual([]);
    expect(overridesFor("a").enabled_tools).toEqual([]);
  });

  it("keeps settings isolated per conversation (AC7)", () => {
    const { setSystemPrompt, setTopK, getFor } = useExperiment.getState();
    setSystemPrompt("a", "only A");
    setTopK("a", 7);
    expect(getFor("b")).toEqual(DEFAULT_EXPERIMENT);
    expect(getFor("a").systemPrompt).toBe("only A");
    expect(getFor("a").topK).toBe(7);
  });

  it("adopts a draft's settings onto a newly-persisted conversation (AC7)", () => {
    const { setSystemPrompt, adopt, getFor } = useExperiment.getState();
    setSystemPrompt(null, "drafted"); // draft bucket
    expect(getFor(null).systemPrompt).toBe("drafted");
    adopt(null, "real-id");
    expect(getFor("real-id").systemPrompt).toBe("drafted");
    // the draft bucket is cleared after adoption
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
