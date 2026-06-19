// Bug fix (074 follow-up): the model shown "at the top" (LLM Inspector + composer
// cost estimate) was fixed to the server default (/api/health → gpt-4.1-mini),
// ignoring the selected agent. It must reflect the ACTIVE agent's model+provider
// (e.g. an Ollama model), falling back to the health default only when there's no
// agent. These cover the pure resolver that the `useActiveModel` hook wraps.

import { describe, expect, it } from "vitest";

import type { AgentMeta, SessionMeta } from "./chatApi";
import { pickActiveAgent, resolveActiveModel } from "./activeModel";

const agent = (over: Partial<AgentMeta> = {}): AgentMeta => ({
  id: "a1",
  name: "A",
  description: "",
  system_prompt: "",
  agent_prompt: "",
  model: "gpt-4.1-mini",
  provider: "openai",
  enabled_tools: [],
  is_default: true,
  created_at: 0,
  updated_at: 0,
  ...over,
});

const session = (id: string, a: AgentMeta | null): SessionMeta => ({
  id,
  title: null,
  agent: a,
  created_at: 0,
  updated_at: 0,
});

describe("resolveActiveModel", () => {
  it("uses the active session's agent model + provider (Ollama)", () => {
    const ag = agent({ model: "llama3.1", provider: "ollama" });
    const r = resolveActiveModel(
      { activeSessionId: "s1", sessions: [session("s1", ag)], draftAgent: null },
      "gpt-4.1-mini",
    );
    expect(r).toEqual({ model: "llama3.1", provider: "ollama" });
  });

  it("uses the draft agent's model when there is no active session yet", () => {
    const ag = agent({ model: "qwen2.5", provider: "ollama" });
    const r = resolveActiveModel(
      { activeSessionId: null, sessions: [], draftAgent: ag },
      "gpt-4.1-mini",
    );
    expect(r).toEqual({ model: "qwen2.5", provider: "ollama" });
  });

  it("falls back to the health default when no agent is resolvable", () => {
    const r = resolveActiveModel(
      { activeSessionId: null, sessions: [], draftAgent: null },
      "gpt-4.1-mini",
    );
    expect(r).toEqual({ model: "gpt-4.1-mini", provider: null });
  });

  it("prefers the catalog's fresh row over a stale inlined draft agent", () => {
    // The dialog edited the agent to Ollama/llama3.1, reflected in the catalog,
    // but the draft snapshot still says gpt-4.1-mini → the header must show the
    // catalog's fresh model.
    const stale = agent({ id: "x", model: "gpt-4.1-mini", provider: "openai" });
    const fresh = agent({ id: "x", model: "llama3.1", provider: "ollama" });
    const r = resolveActiveModel(
      { activeSessionId: null, sessions: [], draftAgent: stale },
      "gpt-4.1-mini",
      [fresh],
    );
    expect(r).toEqual({ model: "llama3.1", provider: "ollama" });
  });

  it("pickActiveAgent prefers the active session over the draft", () => {
    const ses = agent({ id: "ses" });
    const draft = agent({ id: "draft" });
    const picked = pickActiveAgent({
      activeSessionId: "s1",
      sessions: [session("s1", ses)],
      draftAgent: draft,
    });
    expect(picked?.id).toBe("ses");
  });
});
