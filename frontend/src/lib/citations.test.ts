// 019-inline-citations — `citations(answer, sources)` is a pure, deterministic
// lexical-overlap attributor. A sentence cites a source ONLY when they share a
// contiguous significant n-gram of ≥ MIN_NGRAM words; otherwise it carries no
// citation (honest by construction — §everything-is-real, no fabrication). These
// tests pin the positive link (AC1), the negative no-fabrication case (AC2), and
// the hover-payload completeness (AC3).

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import {
  citations,
  type ChunkSource,
  type CitationSource,
  type ToolSource,
  MIN_NGRAM,
  sourcesFromEvents,
} from "./citations";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown>): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

const ragSentence = "Retrieval-Augmented Generation grounds an LLM in retrieved documents.";
const chunk: ChunkSource = {
  kind: "chunk",
  id: "rag.md",
  source: "rag.md",
  score: 0.91,
  text: ragSentence,
};
const tool: ToolSource = {
  kind: "tool",
  id: "kb_lookup#0",
  tool: "kb_lookup",
  args: { topic: "rag" },
  text: ragSentence,
};

describe("citations — positive link (AC1)", () => {
  it("links a sentence to a source sharing a ≥MIN_NGRAM significant n-gram", () => {
    const answer = `${ragSentence} The weather today is sunny and warm.`;
    const result = citations(answer, [chunk]);
    expect(result.segments).toHaveLength(2);
    // First sentence echoes the source → cited; second is unrelated → not.
    expect(result.segments[0].citation?.source.id).toBe("rag.md");
    expect(result.segments[1].citation).toBeNull();
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].index).toBe(1);
  });

  it("needs at least MIN_NGRAM contiguous significant words to link", () => {
    // Shares only "generation grounds" (2 significant words) → below the bar.
    const short = citations("Generation grounds models somehow entirely.", [chunk]);
    expect(short.segments[0].citation).toBeNull();
    expect(MIN_NGRAM).toBeGreaterThanOrEqual(3);
  });

  it("on a tie, attributes the source with the longest shared n-gram", () => {
    const longer: CitationSource = {
      kind: "chunk",
      id: "long.md",
      source: "long.md",
      score: 0.5,
      text: ragSentence, // shares the full long run
    };
    const shorter: CitationSource = {
      kind: "chunk",
      id: "short.md",
      source: "short.md",
      score: 0.99, // higher score must NOT win — the rule is longest n-gram
      // Shares "retrieval augmented generation grounds" (4) — qualifies, but the
      // run is shorter than `longer`'s full overlap, so `longer` must win.
      text: "Retrieval augmented generation grounds everything quickly.",
    };
    const result = citations(ragSentence, [shorter, longer]);
    expect(result.segments[0].citation?.source.id).toBe("long.md");
  });
});

describe("citations — no fabrication (AC2)", () => {
  it("emits NO citation when no source shares a qualifying n-gram", () => {
    const answer = "Bananas ripen quickly in warm tropical kitchens nowadays.";
    const result = citations(answer, [chunk, tool]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].citation).toBeNull();
    expect(result.citations).toHaveLength(0);
  });

  it("with no sources at all, no sentence is cited", () => {
    const result = citations(`${ragSentence} Another sentence here.`, []);
    expect(result.citations).toHaveLength(0);
    expect(result.segments.every((s) => s.citation === null)).toBe(true);
  });
});

describe("citations — hover payload completeness (AC3)", () => {
  it("a tool citation carries kind, tool name, args and snippet", () => {
    const answer = ragSentence;
    const result = citations(answer, [tool]);
    const src = result.segments[0].citation?.source;
    expect(src?.kind).toBe("tool");
    if (src?.kind === "tool") {
      expect(src.tool).toBe("kb_lookup");
      expect(src.args).toEqual({ topic: "rag" });
      expect(src.text).toContain("Retrieval-Augmented");
    }
  });

  it("a chunk citation carries kind, source, score and snippet", () => {
    const result = citations(ragSentence, [chunk]);
    const src = result.segments[0].citation?.source;
    expect(src?.kind).toBe("chunk");
    if (src?.kind === "chunk") {
      expect(src.source).toBe("rag.md");
      expect(src.score).toBeCloseTo(0.91);
      expect(src.text).toContain("retrieved documents");
    }
  });
});

describe("sourcesFromEvents", () => {
  it("extracts tool results (mcp.call) and retrieved chunks (rag.retrieve)", () => {
    seq = 0;
    const events = [
      ev("mcp.call", "end", {
        tool: "kb_lookup",
        args: { topic: "rag" },
        result: ragSentence,
        found: true,
      }),
      ev("rag.retrieve", "end", {
        chunks: [{ text: ragSentence, source: "rag.md", score: 0.91 }],
        k: 3,
      }),
    ];
    const sources = sourcesFromEvents(events);
    expect(sources.some((s) => s.kind === "tool" && s.tool === "kb_lookup")).toBe(true);
    expect(sources.some((s) => s.kind === "chunk" && s.source === "rag.md")).toBe(true);
    // Each source carries matchable text.
    expect(sources.every((s) => s.text.length > 0)).toBe(true);
  });
});
