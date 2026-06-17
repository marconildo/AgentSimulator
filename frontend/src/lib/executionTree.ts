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
  | "persist"
  // 062-deepagents-execution-spans — the DeepAgents runtime's steps get their own
  // top-level rows instead of being folded into `think` via the `reason` phase.
  | "plan"
  | "delegate"
  | "fs-write"
  | "fs-read";

// DeepAgents stages bypass the phase grouping (which lumps them all into `reason`
// → `think`) and map straight to their own node, so the steps that define a
// DeepAgent — plan, file ops, delegation — are visible as distinct spans. This is
// finer-grained than `PHASE_TO_NODE` on purpose; the timeline phase rail (phases.ts)
// keeps grouping these under `reason`, which is correct for that projection.
const STAGE_TO_DEEPAGENTS_NODE: Partial<Record<Stage, TraceNode>> = {
  "agent.plan": "plan",
  "agent.fs.write": "fs-write",
  "agent.fs.read": "fs-read",
  "agent.delegate": "delegate",
};

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
  // 062 — a short row tag: a file path (fs-write/fs-read) or sub-agent type
  // (delegate). A proper noun — rendered verbatim, never translated.
  detail?: string;
  // 062 — the plan's todo count (the `plan` node only); rendered with an i18n word.
  count?: number;
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

/** The first string value found under `data[key]` across the occurrence's events. */
function firstStr(occ: Occurrence, key: string): string | undefined {
  for (const e of occ.events) {
    const v = e.data?.[key];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

/** The first finite number under `data[key]` across the occurrence's events. */
function firstNum(occ: Occurrence, key: string): number | undefined {
  for (const e of occ.events) {
    const v = num(e.data?.[key]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Children of a `delegate` span: the sub-agent's tool trail. The agent.delegate
 * END carries `data.steps` (the tools the sub-agent used) — we show those, so the
 * delegation reads as one collapsible span (context quarantine) rather than letting
 * the sub-agent's nested rag/tool events leak out as phantom top-level rows.
 */
function delegateChildren(occ: Occurrence, runStart: number): SpanChild[] {
  const end = occ.events.find((e) => e.stage === "agent.delegate" && e.phase === "end");
  const raw = end?.data?.steps;
  const steps = Array.isArray(raw) ? raw : [];
  const offsetMs = occ.firstTs - runStart;
  return steps
    .map((s) => (typeof s === "string" ? s : String(s)))
    .filter((s) => s)
    .map((label) => ({ label, offsetMs, durationMs: 0 }));
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
  // 062 — while inside an agent.delegate START…END window, every event is swallowed
  // into the delegation (context quarantine) instead of forming sibling spans.
  let delegate: Occurrence | null = null;

  const finish = (occ: Occurrence): TraceSpan => {
    const isDelegate = occ.node === "delegate";
    const span: TraceSpan = {
      node: occ.node,
      offsetMs: occ.firstTs - runStart,
      durationMs: occ.lastTs - occ.firstTs,
      tokens: sumMetric(occ.events, "total_tokens") || undefined,
      costUsd: sumMetric(occ.events, "cost_usd") || undefined,
      children: isDelegate ? delegateChildren(occ, runStart) : childrenFor(occ, runStart),
    };
    if (isDelegate) span.detail = firstStr(occ, "subagent");
    else if (occ.node === "fs-write" || occ.node === "fs-read") span.detail = firstStr(occ, "path");
    else if (occ.node === "plan") span.count = firstNum(occ, "count");
    return span;
  };

  const flush = () => {
    if (!cur) return;
    spans.push(finish(cur));
    cur = null;
  };

  for (const e of events) {
    const ts = toMs(e.ts);

    // Inside a delegation: accumulate until the matching agent.delegate END.
    if (delegate) {
      delegate.events.push(e);
      delegate.lastTs = ts;
      if (e.stage === "agent.delegate" && e.phase === "end") {
        spans.push(finish(delegate));
        delegate = null;
      }
      continue;
    }
    // Opening a delegation closes any in-flight occurrence first.
    if (e.stage === "agent.delegate" && e.phase === "start") {
      flush();
      delegate = { node: "delegate", events: [e], firstTs: ts, lastTs: ts };
      continue;
    }

    // DeepAgents stages map straight to their own node; everything else groups by
    // timeline phase.
    const node =
      STAGE_TO_DEEPAGENTS_NODE[e.stage] ??
      ((): TraceNode | null => {
        const phase = STAGE_TO_PHASE[e.stage];
        return phase ? PHASE_TO_NODE[phase] : null;
      })();
    if (!node) continue; // unmapped stage or the request envelope — not a node
    if (cur && cur.node === node) {
      cur.events.push(e);
      cur.lastTs = ts; // extend the current occurrence
    } else {
      flush(); // a new contiguous occurrence begins
      cur = { node, events: [e], firstTs: ts, lastTs: ts };
    }
  }
  flush();
  if (delegate) spans.push(finish(delegate)); // a truncated run left it open

  const totalTokens = spans.reduce((a, s) => a + (s.tokens ?? 0), 0);
  const totalCostUsd = spans.reduce((a, s) => a + (s.costUsd ?? 0), 0);
  return { spans, totalMs, totalTokens, totalCostUsd };
}
