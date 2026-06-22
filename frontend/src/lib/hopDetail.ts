// 085-hop-communication-detail — project the trace into the REAL data that
// crossed a given hop this run. A pure selector (no new Stage, no fetch): it reads
// only data already on the events, so step/replay shows the hop's data as of the
// cursor (the caller passes the cursor-bounded `events`). Labels live in the
// component (i18n) — this module returns semantic data only, so it stays testable.

import type { StationId } from "./stations";
import { tallyUsage, type TurnUsage } from "./usage";
import type { DbQuery, EdgeData, PromptPreview, RequestBody, TraceEvent } from "../types/events";

/** One segment of the network-edge chain (DNS·CDN·TLS/LB·WAF·API GW). Only the
 *  TLS/LB segment executes for real; the rest are preview (§3). */
export interface EdgeChainSeg {
  id: string;
  label: string;
  real: boolean;
  value: string | null; // the real value (TLS/LB), or null for preview segments
}

/** The real per-run data that crossed a hop, as a discriminated union by kind. */
export type HopRunData =
  | { kind: "request"; message?: string; requestBody?: RequestBody; answer?: string }
  | {
      kind: "edge";
      edge?: EdgeData;
      chain: EdgeChainSeg[];
      message?: string;
      requestBody?: RequestBody;
      answer?: string;
    }
  | { kind: "sql"; queries: DbQuery[] }
  | { kind: "rag"; chunks: number; topScore?: number }
  | { kind: "mcp"; toolCalls: { tool: string; result: string }[] }
  | { kind: "llm"; prompt?: PromptPreview; usage: TurnUsage }
  | { kind: "none" };

function lastEnd(events: TraceEvent[], stage: TraceEvent["stage"]): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].stage === stage && events[i].phase === "end") return events[i];
  }
  return undefined;
}

/** Build the edge chain; only TLS/LB binds to real edge data, the rest are preview. */
export function buildEdgeChain(edge?: EdgeData): EdgeChainSeg[] {
  const tlsLb = edge ? (edge.proxied ? `${edge.proxy_server ?? "proxy"} · ${edge.scheme}` : "direct") : null;
  // 090-waf-after-lb: transit order — the LB terminates TLS, then the WAF inspects.
  return [
    { id: "dns", label: "DNS", real: false, value: null },
    { id: "cdn", label: "CDN", real: false, value: null },
    { id: "tls-lb", label: "TLS / LB", real: true, value: tlsLb },
    { id: "waf", label: "WAF", real: false, value: null },
    { id: "api-gw", label: "API GW", real: false, value: null },
  ];
}

function requestParts(events: TraceEvent[]): { message?: string; requestBody?: RequestBody; answer?: string } {
  const fe = lastEnd(events, "frontend");
  const respond = lastEnd(events, "respond") ?? lastEnd(events, "llm.generate");
  return {
    message: fe?.data.message as string | undefined,
    requestBody: fe?.data.request as RequestBody | undefined,
    answer: respond?.data.answer as string | undefined,
  };
}

/** The real data that traversed `source → target` this run. */
export function deriveHopData(
  source: StationId,
  target: StationId,
  events: TraceEvent[],
): HopRunData {
  // The public request hop. 085: the network edge has no node of its own — when the
  // run went through the edge (an `edge` event is present) this hop shows the edge
  // chain (DNS·CDN·TLS/LB·WAF·API GW) + the forwarded headers, plus the round-trip;
  // otherwise it is a plain request (request body + answer).
  if (source === "frontend" && target === "backend") {
    const edge = lastEnd(events, "edge")?.data as unknown as EdgeData | undefined;
    if (edge) return { kind: "edge", edge, chain: buildEdgeChain(edge), ...requestParts(events) };
    return { kind: "request", ...requestParts(events) };
  }
  // The relational store: every real SQL statement of the turn (079 data).
  if (source === "backend" && target === "database") {
    const queries: DbQuery[] = [];
    for (const ev of events) {
      if ((ev.stage === "db.read" || ev.stage === "db.write") && ev.phase === "end") {
        for (const q of (ev.data.queries as DbQuery[] | undefined) ?? []) queries.push(q);
      }
    }
    return queries.length ? { kind: "sql", queries } : { kind: "none" };
  }
  // Vector retrieval: how many chunks came back, and the top score.
  if (source === "agent" && target === "rag") {
    const ret = lastEnd(events, "rag.retrieve");
    if (!ret) return { kind: "none" };
    const chunks = (ret.data.chunks as unknown[] | undefined)?.length ?? (ret.data.k as number | undefined) ?? 0;
    return { kind: "rag", chunks, topScore: ret.metrics.top_score };
  }
  // Tool calls over MCP: each tool → result.
  if (source === "agent" && target === "mcp") {
    const toolCalls = events
      .filter((e) => e.stage === "mcp.call" && e.phase === "end")
      .map((e) => ({ tool: String(e.data.tool ?? "?"), result: String(e.data.result ?? "") }));
    return toolCalls.length ? { kind: "mcp", toolCalls } : { kind: "none" };
  }
  // The model endpoint: the assembled prompt + the turn's token usage/cost.
  if (source === "agent" && target === "llm") {
    const prompt = lastEnd(events, "llm.prompt")?.data as PromptPreview | undefined;
    return { kind: "llm", prompt, usage: tallyUsage(events) };
  }
  return { kind: "none" };
}
