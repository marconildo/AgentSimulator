// 027-skills — `appliedSkills(events)` is a pure projection of a turn's trace:
// the distinct skills the agent successfully loaded (a `load_skill` mcp.call with
// a non-error result). It mirrors the backend's persisted set, so the footer
// badge can derive from a live trace and match the reloaded message.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { appliedSkills } from "./skills";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown>): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function loadSkill(name: string, result: string): TraceEvent {
  return ev("mcp.call", "end", { tool: "load_skill", args: { name }, result });
}

describe("appliedSkills", () => {
  it("collects distinct, successful loads in order", () => {
    const events = [
      loadSkill("resumo-em-bullets", "BODY A"),
      ev("mcp.call", "end", { tool: "calculator", args: { expression: "2+2" }, result: "4" }),
      loadSkill("resumo-em-bullets", "BODY A"), // duplicate ⇒ deduped
      loadSkill("glossario-ao-final", "BODY B"),
    ];
    expect(appliedSkills(events)).toEqual(["resumo-em-bullets", "glossario-ao-final"]);
  });

  it("ignores failed (not-found) loads", () => {
    const events = [loadSkill("missing", "error: skill 'missing' not found")];
    expect(appliedSkills(events)).toEqual([]);
  });

  it("ignores non-end events and non-skill tool calls", () => {
    const events = [
      ev("mcp.call", "start", { tool: "load_skill", args: { name: "x" }, result: "" }),
      ev("mcp.call", "end", { tool: "kb_lookup", args: { topic: "rag" }, result: "..." }),
    ];
    expect(appliedSkills(events)).toEqual([]);
  });

  it("returns an empty list for no events", () => {
    expect(appliedSkills([])).toEqual([]);
  });
});
