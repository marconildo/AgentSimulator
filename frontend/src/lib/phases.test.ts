// 004-timeline-phases — the phase rail is a pure grouping of the existing
// `Stage`s into named, ordered timeline phases. These tests pin the spec's
// acceptance criteria (AC1–AC6) at the logic level so the rail can be reasoned
// about without rendering.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { LANGS } from "../i18n";
import {
  activePhase,
  PHASE_ORDER,
  phaseLabelsFor,
  phaseMarkers,
  STAGE_TO_PHASE,
  type TimelinePhase,
} from "./phases";
import { STAGE_TO_STATION, stationByIdFor } from "./stations";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// A plain run with no tool call: request → memory → route → retrieve → reason →
// generate → respond → persist (no `tools` phase fired).
function plainRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "start"),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.embed", "start"),
    ev("rag.embed", "end", { dim: 1536 }),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "start"),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.prompt", "end", { system: "you are…" }),
    ev("llm.generate", "start"),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "end", { answer: "Hello." }),
    ev("db.write", "end", { operation: "INSERT" }),
    ev("backend", "end", { answer: "Hello." }),
  ];
}

// A ReAct run that loops twice: reason → tools → reason → tools → generate.
function reactRun(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "2+2 then time?" }),
    ev("backend", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "end", { query: "2+2 then time?" }),
    ev("rag.embed", "end", { dim: 1536 }),
    ev("rag.retrieve", "end", { chunks: [] }),
    // loop 1: reason → tools
    ev("agent.think", "start"),
    ev("agent.think", "end", { decision: "tool" }),
    ev("llm.prompt", "end", {}),
    ev("mcp.discover", "end", { tools: ["calculator"] }),
    ev("mcp.call", "end", { tool: "calculator", result: 4 }),
    // loop 2: reason → tools
    ev("agent.think", "end", { decision: "tool" }),
    ev("llm.prompt", "end", {}),
    ev("mcp.call", "end", { tool: "current_time", result: "12:00" }),
    // finish
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "end", { answer: "It is 12:00 and 2+2=4." }),
    ev("respond", "end", { answer: "It is 12:00 and 2+2=4." }),
    ev("db.write", "end", { operation: "INSERT" }),
    ev("backend", "end", { answer: "done" }),
  ];
}

describe("STAGE_TO_PHASE — exhaustive grouping (AC1)", () => {
  it("maps every Stage to exactly one phase (same key set as STAGE_TO_STATION)", () => {
    // STAGE_TO_STATION is the §6 guarantee that every Stage is mapped; the phase
    // grouping must cover the exact same set of stages — no more, no fewer.
    const stages = Object.keys(STAGE_TO_STATION).sort();
    const phased = Object.keys(STAGE_TO_PHASE).sort();
    expect(phased).toEqual(stages);
  });

  it("only maps to phases declared in PHASE_ORDER", () => {
    for (const phase of Object.values(STAGE_TO_PHASE)) {
      expect(PHASE_ORDER).toContain(phase);
    }
  });

  it("PHASE_ORDER has no duplicates", () => {
    expect(new Set(PHASE_ORDER).size).toBe(PHASE_ORDER.length);
  });

  it("every phase in PHASE_ORDER owns at least one stage (no orphan phase)", () => {
    const used = new Set<TimelinePhase>(Object.values(STAGE_TO_PHASE));
    for (const phase of PHASE_ORDER) expect(used.has(phase)).toBe(true);
  });

  it("no live Stage maps to a coming-soon preview station (008 AC7)", () => {
    // Scenario scoping (008) adds preview nodes that carry no stages. The
    // protocol's totality is preserved precisely because no live Stage ever
    // resolves to a non-executing node — guards §3 (nothing fakes a run).
    const byId = stationByIdFor("en");
    for (const stationId of Object.values(STAGE_TO_STATION)) {
      expect(byId[stationId].comingSoon ?? false).toBe(false);
    }
  });
});

describe("phaseMarkers (AC2, AC3)", () => {
  it("returns the occurring phases in run order with the first-event index", () => {
    const events = plainRun();
    const markers = phaseMarkers(events);

    expect(markers.map((m) => m.phase)).toEqual([
      "request",
      "memory",
      "route",
      "retrieve",
      "reason",
      "generate",
      "respond",
      "persist",
    ]);
    // `tools` never fired in a no-tool run.
    expect(markers.map((m) => m.phase)).not.toContain("tools");

    // Each index points at the FIRST event of that phase (AC2) — this is exactly
    // the value clicking the chip passes to setCursor (AC3 at the logic level).
    const byPhase = Object.fromEntries(markers.map((m) => [m.phase, m]));
    expect(byPhase.retrieve.index).toBe(events.findIndex((e) => e.stage === "rag.embed"));
    expect(byPhase.reason.index).toBe(events.findIndex((e) => e.stage === "agent.think"));
    expect(byPhase.persist.index).toBe(events.findIndex((e) => e.stage === "db.write"));
  });

  it("counts maximal contiguous segments so a ReAct loop reads reason ×3 (Q3)", () => {
    const events = reactRun();
    const markers = phaseMarkers(events);
    const byPhase = Object.fromEntries(markers.map((m) => [m.phase, m]));

    // The agent reasoned 3 times (tool, tool, answer) and used tools across 2 of
    // those turns → reason ×3, tools ×2.
    expect(byPhase.reason.count).toBe(3);
    expect(byPhase.tools.count).toBe(2);
    // A phase that ran in a single contiguous segment has count 1.
    expect(byPhase.generate.count).toBe(1);
    // `request` brackets the whole run: the outermost BACKEND stage opens it
    // (backend/start) and closes it (backend/end, the terminal event), so the
    // request phase legitimately spans two contiguous segments.
    expect(byPhase.request.count).toBe(2);

    // The chip still jumps to the FIRST occurrence.
    expect(byPhase.reason.index).toBe(events.findIndex((e) => e.stage === "agent.think"));
    expect(byPhase.tools.index).toBe(events.findIndex((e) => e.stage === "mcp.discover"));
  });

  it("returns [] for an empty log", () => {
    expect(phaseMarkers([])).toEqual([]);
  });
});

describe("activePhase (AC4)", () => {
  it("returns the phase the cursor's event belongs to", () => {
    const events = plainRun();
    const at = events.findIndex((e) => e.stage === "rag.embed");
    expect(activePhase(events, at)).toBe("retrieve");
    expect(activePhase(events, events.findIndex((e) => e.stage === "agent.think"))).toBe("reason");
    expect(activePhase(events, events.findIndex((e) => e.stage === "frontend"))).toBe("request");
  });

  it("returns null for an out-of-range or negative cursor", () => {
    const events = plainRun();
    expect(activePhase(events, -1)).toBeNull();
    expect(activePhase(events, events.length)).toBeNull();
    expect(activePhase([], 0)).toBeNull();
  });
});

describe("phaseLabelsFor — bilingual (AC5)", () => {
  it("has a non-empty label for every phase in every language", () => {
    for (const { code } of LANGS) {
      const labels = phaseLabelsFor(code);
      for (const phase of PHASE_ORDER) {
        expect(labels[phase], `${code}/${phase}`).toBeTruthy();
      }
    }
  });

  it("returns a stable reference per language (cached)", () => {
    expect(phaseLabelsFor("en")).toBe(phaseLabelsFor("en"));
  });
});

describe("derivers are pure (AC6)", () => {
  it("do not mutate their input and are deterministic", () => {
    const events = Object.freeze(plainRun()) as TraceEvent[];
    // Would throw on any in-place mutation of the frozen array.
    const a = phaseMarkers(events);
    const b = phaseMarkers(events);
    expect(a).toEqual(b);
    expect(activePhase(events, 0)).toBe(activePhase(events, 0));
  });
});
