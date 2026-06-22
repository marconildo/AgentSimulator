// 085-hop-communication-detail — deriveHopData projects the trace into the REAL
// data that crossed a given hop this run (pure, no new Stage). Structural asserts.
import { describe, expect, it } from "vitest";

import type { TraceEvent } from "../types/events";
import { buildEdgeChain, deriveHopData } from "./hopDetail";

let seq = 0;
function end(stage: TraceEvent["stage"], data: Record<string, unknown> = {}, metrics: Record<string, number> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase: "end", label: "", data, metrics };
}

// A representative run: request → edge → db → rag → mcp → llm → respond.
function run(): TraceEvent[] {
  seq = 0;
  return [
    end("frontend", { message: "What is RAG?", request: { message: "What is RAG?", top_k: 4 } }),
    end("edge", { proxied: true, scheme: "https", proxy_server: "nginx", client_ip: "198.51.100.42", request_id: "req-1" }),
    end("db.read", { queries: [{ operation: "SELECT", sql: "SELECT * FROM messages", rows: 3 }] }),
    end("db.write", { queries: [{ operation: "INSERT", sql: "INSERT INTO messages …", rows: 1 }] }),
    end("rag.retrieve", { chunks: [{}, {}, {}], k: 3 }, { top_score: 0.61 }),
    end("mcp.call", { tool: "calculator", result: 4 }),
    end("llm.prompt", { system: "you are…", context: "…", tools: ["calculator"] }),
    end("llm.generate", { answer: "RAG is…" }, { total_tokens: 120, cost_usd: 0.0013 }),
    end("respond", { answer: "RAG is…" }),
  ];
}

describe("deriveHopData (085)", () => {
  it("frontend→backend (edge ran) → kind edge with the chain + forwarded headers + round-trip", () => {
    const d = deriveHopData("frontend", "backend", run());
    expect(d.kind).toBe("edge");
    if (d.kind !== "edge") return;
    expect(d.edge?.proxied).toBe(true);
    expect(d.edge?.client_ip).toBe("198.51.100.42");
    expect(d.chain.find((s) => s.id === "tls-lb")?.real).toBe(true);
    expect(d.chain.find((s) => s.id === "dns")?.real).toBe(false);
    expect(d.requestBody?.message).toBe("What is RAG?");
    expect(d.answer).toBe("RAG is…");
  });

  it("frontend→backend (no edge) → kind request with body + answer", () => {
    const d = deriveHopData("frontend", "backend", run().filter((e) => e.stage !== "edge"));
    expect(d.kind).toBe("request");
    if (d.kind !== "request") return;
    expect(d.requestBody?.message).toBe("What is RAG?");
    expect(d.answer).toBe("RAG is…");
  });

  it("backend→database → kind sql with all statements (read + write)", () => {
    const d = deriveHopData("backend", "database", run());
    expect(d.kind).toBe("sql");
    if (d.kind !== "sql") return;
    expect(d.queries.map((q) => q.operation)).toEqual(["SELECT", "INSERT"]);
  });

  it("agent→rag → kind rag with chunk count + top score", () => {
    const d = deriveHopData("agent", "rag", run());
    expect(d.kind).toBe("rag");
    if (d.kind !== "rag") return;
    expect(d.chunks).toBe(3);
    expect(d.topScore).toBeCloseTo(0.61, 2);
  });

  it("agent→mcp → kind mcp with the tool calls", () => {
    const d = deriveHopData("agent", "mcp", run());
    expect(d.kind).toBe("mcp");
    if (d.kind !== "mcp") return;
    expect(d.toolCalls).toEqual([{ tool: "calculator", result: "4" }]);
  });

  it("agent→llm → kind llm with the assembled prompt + usage", () => {
    const d = deriveHopData("agent", "llm", run());
    expect(d.kind).toBe("llm");
    if (d.kind !== "llm") return;
    expect(d.prompt?.system).toBe("you are…");
    expect(d.usage.totalTokens).toBe(120);
  });

  it("an unknown hop → kind none; the empty public hop → kind request with nothing filled", () => {
    expect(deriveHopData("backend", "agent", run()).kind).toBe("none");
    const empty = deriveHopData("frontend", "backend", []);
    expect(empty.kind).toBe("request");
    if (empty.kind === "request") expect(empty.requestBody).toBeUndefined();
  });

  it("is pure — does not mutate its input", () => {
    const events = Object.freeze(run()) as TraceEvent[];
    expect(() => deriveHopData("agent", "llm", events)).not.toThrow();
    expect(deriveHopData("agent", "rag", events)).toEqual(deriveHopData("agent", "rag", events));
  });

  it("buildEdgeChain marks only TLS/LB real; uses proxy/scheme when proxied", () => {
    const chain = buildEdgeChain({
      proxied: true,
      tls: true,
      scheme: "https",
      client_ip: "1.2.3.4",
      request_id: "r",
      proxy_server: "nginx",
      forwarded_host: null,
    });
    const real = chain.filter((s) => s.real).map((s) => s.id);
    expect(real).toEqual(["tls-lb"]);
    expect(chain.find((s) => s.id === "tls-lb")?.value).toContain("nginx");
  });
});
