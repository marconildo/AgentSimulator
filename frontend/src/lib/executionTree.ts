// 038-execution-traces — a pure projection of the event log into a LangSmith-
// style 2-level span tree. Parents are pipeline-node occurrences in run order
// (a ReAct loop yields `think`/`tools` more than once, kept separate); children
// are the model call / tool call / RAG step nested inside the node that made it.
// Reads only existing event timing + the 011 token/cost metrics — no new
// `Stage`, no backend change, nothing re-measured. Supersedes 015's flat
// waterfall: same honest timing model (the frontend/backend request envelope is
// excluded; a span's duration is its wall-clock footprint; the total is the run
// span), promoted one level so the parent/child structure of the run is visible.

import { STAGE_TO_PHASE, type TimelinePhase } from "./phases";
import { toMs } from "./time";
import type { Stage, TraceEvent } from "../types/events";

/** The pipeline nodes a span can represent (LangGraph-faithful names). */
export type TraceNode =
  | "route"
  | "think"
  | "tools"
  | "generate"
  | "respond"
  | "retrieve"
  | "memory"
  | "persist";

// Each occurrence groups by timeline phase; the `request` phase is the
// frontend/backend envelope and is excluded from the tree (it ≈ the whole run).
const PHASE_TO_NODE: Record<TimelinePhase, TraceNode | null> = {
  request: null,
  memory: "memory",
  route: "route",
  retrieve: "retrieve",
  reason: "think",
  tools: "tools",
  generate: "generate",
  respond: "respond",
  persist: "persist",
};

// RAG retrieve sub-steps, in pipeline order, named for the child rows.
const RAG_CHILD: Partial<Record<Stage, string>> = {
  "rag.embed": "embed",
  "rag.search": "search",
  "rag.retrieve": "select",
};

/** A nested call inside a node — the LLM call, a tool execution, a RAG step. */
export interface SpanChild {
  label: string; // "ChatOpenAI" | tool name | RAG step — a proper noun, not translated
  model?: string; // the model name for a ChatOpenAI call, when the events provide it
  offsetMs: number;
  durationMs: number;
  tokens?: number;
  costUsd?: number;
}

/** One pipeline-node occurrence (a parent row). */
export interface TraceSpan {
  node: TraceNode;
  offsetMs: number; // ms from the run start to this occurrence's first event
  durationMs: number; // wall-clock footprint of the occurrence (≥ 0)
  tokens?: number;
  costUsd?: number;
  children: SpanChild[];
}

export interface ExecutionTree {
  spans: TraceSpan[];
  totalMs: number; // the run's wall-clock span (last ts − first ts)
  totalTokens: number;
  totalCostUsd: number;
}

// In-progress accumulator for one contiguous node occurrence.
interface Occurrence {
  node: TraceNode;
  events: TraceEvent[];
  firstTs: number;
  lastTs: number;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** The model name carried on any END event in the occurrence (agent.think). */
function modelOf(events: TraceEvent[]): string | undefined {
  for (const e of events) {
    const m = e.data?.model;
    if (typeof m === "string" && m) return m;
  }
  return undefined;
}

/** Sum a metric over the occurrence's END events (only LLM stages carry tokens/cost). */
function sumMetric(events: TraceEvent[], key: string): number {
  let total = 0;
  for (const e of events) {
    if (e.phase !== "end") continue;
    total += num(e.metrics?.[key]) ?? 0;
  }
  return total;
}

/** Derive the child rows of one occurrence, by node kind. */
function childrenFor(occ: Occurrence, runStart: number): SpanChild[] {
  const children: SpanChild[] = [];
  const open = new Map<Stage, TraceEvent>(); // last START seen per stage
  const model = modelOf(occ.events);
  // The model call's figures are the node's figures (LangSmith shows them on both).
  const tokens = sumMetric(occ.events, "total_tokens") || undefined;
  const costUsd = sumMetric(occ.events, "cost_usd") || undefined;

  for (const e of occ.events) {
    if (e.phase === "start") {
      open.set(e.stage, e);
      continue;
    }
    if (e.phase !== "end") continue;
    const start = open.get(e.stage);
    open.delete(e.stage);
    const endTs = toMs(e.ts);
    const durationMs = start ? endTs - toMs(start.ts) : (num(e.metrics?.latency_ms) ?? 0);
    const offsetMs = (start ? toMs(start.ts) : endTs - durationMs) - runStart;

    if (
      (occ.node === "think" || occ.node === "generate") &&
      (e.stage === "llm.prompt" || e.stage === "llm.generate")
    ) {
      children.push({ label: "ChatOpenAI", model, offsetMs, durationMs, tokens, costUsd });
    } else if (occ.node === "tools" && e.stage === "mcp.call") {
      const tool = typeof e.data?.tool === "string" ? e.data.tool : "tool";
      children.push({ label: tool, offsetMs, durationMs });
    } else if (occ.node === "retrieve" && e.stage in RAG_CHILD) {
      children.push({ label: RAG_CHILD[e.stage]!, offsetMs, durationMs });
    }
  }
  return children;
}

/**
 * Fold an event log into a 2-level execution-trace tree. Pure: never reads or
 * mutates anything but its argument.
 */
export function executionTree(events: TraceEvent[]): ExecutionTree {
  if (events.length === 0) {
    return { spans: [], totalMs: 0, totalTokens: 0, totalCostUsd: 0 };
  }

  const runStart = toMs(events[0].ts);
  const runEnd = toMs(events[events.length - 1].ts);
  const totalMs = Math.max(0, runEnd - runStart);

  const spans: TraceSpan[] = [];
  let cur: Occurrence | null = null;

  const flush = () => {
    if (!cur) return;
    spans.push({
      node: cur.node,
      offsetMs: cur.firstTs - runStart,
      durationMs: cur.lastTs - cur.firstTs,
      tokens: sumMetric(cur.events, "total_tokens") || undefined,
      costUsd: sumMetric(cur.events, "cost_usd") || undefined,
      children: childrenFor(cur, runStart),
    });
    cur = null;
  };

  for (const e of events) {
    const phase = STAGE_TO_PHASE[e.stage];
    if (!phase) continue; // defensive: an unmapped stage is skipped, not crashed
    const node = PHASE_TO_NODE[phase];
    if (!node) continue; // the request envelope is not a node
    const ts = toMs(e.ts);
    if (cur && cur.node === node) {
      cur.events.push(e);
      cur.lastTs = ts; // extend the current occurrence
    } else {
      flush(); // a new contiguous occurrence begins
      cur = { node, events: [e], firstTs: ts, lastTs: ts };
    }
  }
  flush();

  const totalTokens = spans.reduce((a, s) => a + (s.tokens ?? 0), 0);
  const totalCostUsd = spans.reduce((a, s) => a + (s.costUsd ?? 0), 0);
  return { spans, totalMs, totalTokens, totalCostUsd };
}
