import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";

import { useT } from "../../i18n";
import { useAgentAnatomy } from "../../lib/agentAnatomy";
import { formatTokens, formatUsd } from "../../lib/cost";
import type { StationRuntime, UsageTotals } from "../../lib/derive";
import { NODE_WIDTH } from "../../lib/layout";
import { formatLatency } from "../../lib/time";
import { READOUT_GLOSSARY_KEY, type StationId, type StationMeta } from "../../lib/stations";
import { useChat } from "../../store/useChat";
import { useSimulator } from "../../store/useSimulator";
import type { TraceEvent } from "../../types/events";

export interface StationNodeData {
  meta: StationMeta;
  runtime: StationRuntime;
  isActive: boolean; // the current station in the flow — the only one highlighted
  isEmphasized?: boolean; // 014 — the station the guided tour is narrating
  readout: string;
  isSelected: boolean;
  expanded: boolean;
  height: number;
  width?: number; // narrower for advanced-rung sub-agent nodes; defaults to NODE_WIDTH
  comingSoon: boolean; // 008 preview node — non-executing, rendered dashed/dimmed
  usage?: UsageTotals; // 011-token-cost — set on the LLM node only
  [key: string]: unknown;
}

// Stations that have a dedicated focused drill-in view.
// 054-rag-block-expansion: the RAG station opens a full RAG-pipeline drill-in.
const HAS_DETAIL: Partial<Record<StationId, boolean>> = {
  agent: true,
  rag: true,
  pageindex: true,
};

export function StationNode(props: NodeProps) {
  const { meta, runtime, isActive, isEmphasized, readout, isSelected, expanded, height, width, comingSoon, usage } =
    props.data as StationNodeData;
  const t = useT();
  const toggleExpand = useSimulator((s) => s.toggleExpand);
  const openDetail = useSimulator((s) => s.openDetail);
  const closeDetail = useSimulator((s) => s.closeDetail);
  const detailOpen = useSimulator((s) => s.detail) === meta.id;
  // 042-agent-anatomy — open the "Configure agent" dialog from the Agent node.
  // The hook is mounted for every station (zustand allows this), but the
  // affordance only renders on the agent station below.
  const openAnatomy = useAgentAnatomy((s) => s.openDialog);
  // The conversation's agent name (when set) overrides the station header
  // label so users see the named agent on the canvas, not the generic "Agent".
  // 043-persisted-agent: read from `session.agent.name` (the inline row);
  // legacy `session.agent_name` was removed in this spec.
  const activeSession = useChat((c) => {
    const id = c.activeSessionId;
    return id ? c.sessions.find((s) => s.id === id) ?? null : null;
  });
  const isAgent = meta.id === "agent";
  const agentName = isAgent ? activeSession?.agent?.name ?? null : null;
  const displayTitle = agentName ?? meta.title;

  // Spotlight model: only the station the packet is at right now is lit; every
  // other station (not yet reached, or already done) stays deactivated. Use the
  // timeline to step back and re-light an earlier stage. A coming-soon preview
  // node never lights up — it is a non-executing placeholder.
  const spotlit = isActive && !comingSoon;
  // 014: a coming-soon preview never runs, so it is never emphasized either.
  const emphasized = Boolean(isEmphasized) && !comingSoon;
  const accent = meta.accent;
  const borderColor = spotlit ? accent : "var(--color-line)";
  const dotColor = spotlit ? accent : "var(--color-faint)";

  // The collapsed readout is dense jargon ("decision: answer", "top-4 · score
  // 0.50"). Append the matching one-line glossary hint to its native tooltip so
  // the term isn't thrown without a definition; fall back to revealing the full
  // (clipped) readout text when the station has no jargon hint.
  const hintKey = READOUT_GLOSSARY_KEY[meta.id];
  const readoutHint = hintKey ? t.glossary[hintKey] : undefined;
  const readoutTitle = readout
    ? readoutHint
      ? `${readout}\n\n${readoutHint}`
      : readout
    : undefined;

  return (
    <motion.div
      animate={{ scale: spotlit || emphasized ? 1.03 : 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 18 }}
      className={`${spotlit ? "station-pulse" : ""} ${emphasized ? "tour-emphasis" : ""}`.trim()}
      style={{ color: accent, width: width ?? NODE_WIDTH, height }}
    >
      <div
        className="flex h-full flex-col rounded-2xl px-4 py-3 backdrop-blur transition-colors"
        style={{
          background: "color-mix(in srgb, var(--color-panel) 92%, transparent)",
          border: `1.5px ${comingSoon ? "dashed" : "solid"} ${borderColor}`,
          boxShadow: isSelected
            ? `0 0 0 2px ${accent}`
            : spotlit
              ? `0 8px 30px -12px ${accent}`
              : "none",
          // The narrated node stays at full opacity so it lifts out of the
          // dimmed neighbours even when it is not the live spotlight (014).
          opacity: comingSoon ? 0.5 : spotlit || emphasized ? 1 : 0.66,
        }}
      >
        <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0, border: "none" }} />
        <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0, border: "none" }} />
        <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0, border: "none" }} />
        <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0, border: "none" }} />

        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            {/* Titles/subtitles can exceed the node width (e.g. "Model Context
                Protocol", "Ingestion / Indexer"); clip with ellipsis but reveal
                the full text on hover via the native title tooltip. */}
            <div
              title={displayTitle}
              className="flex items-center gap-1 truncate text-[13px] font-semibold text-[var(--color-ink)]"
            >
              <span className="truncate">{displayTitle}</span>
              {isAgent && !comingSoon && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openAnatomy("identity");
                  }}
                  title={t.agentAnatomy.editIdentity}
                  aria-label={t.agentAnatomy.editIdentity}
                  data-testid="open-agent-anatomy-edit"
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
                >
                  ✏️
                </button>
              )}
            </div>
          </div>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: dotColor, boxShadow: spotlit ? `0 0 8px ${accent}` : "none" }}
          />
          {!comingSoon && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(meta.id);
              }}
              title={expanded ? t.node.collapse : t.node.expand}
              aria-label={expanded ? t.node.collapse : t.node.expand}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[12px] leading-none transition hover:bg-[var(--color-panel-2)]"
              style={{
                borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
                color: accent,
              }}
            >
              {expanded ? "⊖" : "⊕"}
            </button>
          )}
        </div>

        {/* Subtitle gets its own full-width row (not squeezed beside the icon +
            controls), so longer ones like "Agent Harness · LangGraph runtime"
            fit without truncating. */}
        <div title={meta.subtitle} className="mt-0.5 truncate text-[10px] text-[var(--color-muted)]">
          {meta.subtitle}
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            title={t.glossary[meta.tag]}
            className="inline-flex cursor-help rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide"
            style={{ borderColor: `color-mix(in srgb, ${accent} 33%, transparent)`, color: accent }}
          >
            {meta.tag}
          </span>
          {comingSoon && (
            <span
              className="inline-flex rounded-full border border-dashed px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide"
              style={{ borderColor: accent, color: accent }}
            >
              {t.node.comingSoon}
            </span>
          )}
        </div>

        {expanded ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <ExpandedBody meta={meta} rt={runtime} usage={usage} />
          </div>
        ) : (
          <div
            title={readoutTitle}
            className="mt-2 h-[18px] truncate font-mono text-[10.5px]"
            style={{ color: readout ? accent : "transparent" }}
          >
            {readout || "·"}
          </div>
        )}
        {/* "Open full view" lives outside the expand ternary now — it's just
            as useful in the collapsed card (no reason to expand the node just
            to find this button). The "Configure agent" secondary button moved
            to the masthead's AgentConfigToggle (header-agent-config), where
            it's discoverable from any page. The expand layout reserves a fixed
            slot for this button via EXPANDED_H / COLLAPSED_H in layout.ts. */}
        {HAS_DETAIL[meta.id] && !comingSoon && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Toggle: a second click on an already-open node closes its drill-in
              // (a reliable close path beside the panel's own ✕).
              if (detailOpen) closeDetail();
              else openDetail(meta.id);
            }}
            className="mt-auto w-full rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition hover:bg-[var(--color-panel-2)]"
            style={{
              borderColor: accent,
              color: detailOpen ? "var(--color-base)" : accent,
              background: detailOpen ? accent : "transparent",
            }}
          >
            {meta.id === "rag"
              ? t.node.openPipeline
              : meta.id === "pageindex"
                ? t.node.openRagless
                : t.node.openFull}{" "}
            {detailOpen ? "▾" : "▸"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// --- compact inner detail shown when a node is expanded ----------------------

function ExpandedBody({
  meta,
  rt,
  usage,
}: {
  meta: StationMeta;
  rt: StationRuntime;
  usage?: UsageTotals;
}) {
  const t = useT();
  const i = t.inspector;
  // Node-specific summary rows + a shared latency reading (013) when the stage
  // reported one, so every executing station carries a useful at-a-glance metric;
  // the full drill-down still lives in the Inspector.
  const rows = innerRows(meta.id, rt.events, t, usage);
  if (typeof rt.latencyMs === "number") {
    rows.push({ k: t.node.latency, v: formatLatency(rt.latencyMs) });
  }

  return (
    <div className="space-y-1.5 overflow-hidden">
      <p className="line-clamp-2 text-[10px] leading-snug text-[var(--color-muted)]">{meta.generic}</p>
      {rows.length > 0 ? (
        <div className="space-y-0.5">
          {rows.map((r) => (
            <div key={r.k} className="flex items-baseline justify-between gap-2 text-[10.5px]">
              <span className="shrink-0 text-[var(--color-muted)]">{r.k}</span>
              <span className="truncate text-right font-mono" style={{ color: meta.accent }}>
                {r.v}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] italic text-[var(--color-label)]">{i.status.idle}</p>
      )}
    </div>
  );
}

function lastWith(events: TraceEvent[], pred: (e: TraceEvent) => boolean): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (pred(events[i])) return events[i];
  return undefined;
}

interface Row {
  k: string;
  v: string;
}

function innerRows(
  id: StationId,
  events: TraceEvent[],
  t: ReturnType<typeof useT>,
  usage?: UsageTotals,
): Row[] {
  const i = t.inspector;
  switch (id) {
    case "frontend": {
      const msg = events.find((e) => typeof e.data.message === "string")?.data.message as string | undefined;
      return msg ? [{ k: i.requestSent, v: `"${truncate(msg, 18)}"` }] : [];
    }
    case "backend": {
      return [{ k: "routes", v: "3" }];
    }
    case "agent": {
      const thinks = events.filter((e) => e.stage === "agent.think" && e.phase === "end");
      const last = thinks[thinks.length - 1];
      const route = lastWith(events, (e) => e.stage === "agent.route" && e.phase === "end");
      const rows: Row[] = [];
      if (thinks.length) rows.push({ k: i.reasoningTurns, v: String(thinks.length) });
      if (last) rows.push({ k: i.lastDecision, v: String(last.data.decision ?? "—") });
      if (route && typeof route.data.memory_turns === "number")
        rows.push({ k: t.node.memory, v: `${route.data.memory_turns}` });
      return rows;
    }
    case "database": {
      const read = lastWith(events, (e) => e.stage === "db.read" && e.phase === "end");
      const write = lastWith(events, (e) => e.stage === "db.write" && e.phase === "end");
      const rows: Row[] = [];
      if (read) rows.push({ k: i.totalRows, v: String(read.data.total_rows ?? 0) });
      if (write) rows.push({ k: i.operation, v: String(write.data.operation ?? "INSERT") });
      return rows;
    }
    case "rag": {
      const ret = lastWith(events, (e) => e.stage === "rag.retrieve" && e.phase === "end");
      if (!ret) return [];
      const chunks = (ret.data.chunks as unknown[] | undefined)?.length ?? 0;
      const top = ret.metrics.top_score;
      return [
        { k: i.retrievedChunks(chunks).replace(/\s*\(.*\)/, ""), v: `${chunks}` },
        ...(typeof top === "number" ? [{ k: t.readout.score, v: top.toFixed(2) }] : []),
      ];
    }
    case "storage": {
      // 034-storage-ingestion-flow — the stored object's at-a-glance facts.
      const up = lastWith(events, (e) => e.stage === "storage.upload" && e.phase === "end");
      if (!up) return [];
      const size = up.data.size_bytes as number | undefined;
      const rows: Row[] = [{ k: i.contentType, v: String(up.data.content_type ?? "—") }];
      if (typeof size === "number") rows.push({ k: i.size, v: `${size.toLocaleString()} B` });
      return rows;
    }
    case "ingestion": {
      // 033-ingestion-node — the offline indexer's at-a-glance counts.
      const store = lastWith(events, (e) => e.stage === "rag.ingest.store" && e.phase === "end");
      const chunk = lastWith(events, (e) => e.stage === "rag.ingest.chunk" && e.phase === "end");
      const rows: Row[] = [];
      if (chunk) rows.push({ k: i.chunkStrategy, v: String(chunk.data.strategy ?? "—") });
      if (store) rows.push({ k: i.vectorsStored, v: String(store.data.chunks_stored ?? 0) });
      return rows;
    }
    case "mcp": {
      const disc = lastWith(events, (e) => e.stage === "mcp.discover" && e.phase === "end");
      const call = lastWith(events, (e) => e.stage === "mcp.call" && e.phase === "end");
      const rows: Row[] = [];
      if (disc) rows.push({ k: i.tools, v: String((disc.data.tools as unknown[] | undefined)?.length ?? 0) });
      if (call) rows.push({ k: String(call.data.tool), v: truncate(String(call.data.result), 12) });
      return rows;
    }
    case "llm": {
      const gen = lastWith(events, (e) => e.stage === "llm.generate" && e.phase === "end");
      const tokens = events.filter((e) => e.stage === "llm.generate" && e.phase === "progress").length;
      const rows: Row[] = [];
      if (gen) rows.push({ k: i.model, v: String(gen.data.model ?? "—") });
      // Real rounds / tokens / cost when usage was reported (011-token-cost);
      // otherwise fall back to the live streamed-chunk count.
      if (usage && usage.rounds) rows.push({ k: i.rounds, v: String(usage.rounds) });
      if (usage && usage.totalTokens > 0) {
        rows.push({ k: i.totalTokens, v: formatTokens(usage.totalTokens) });
        rows.push({ k: i.cost, v: formatUsd(usage.costUsd) });
      } else if (tokens) {
        rows.push({ k: i.totalTokens, v: String(tokens) });
      }
      return rows;
    }
    case "pageindex": {
      // 056-ragless-pageindex — the RAGLESS box's at-a-glance facts: tree size +
      // how many sections the LLM navigation selected.
      const tree = lastWith(events, (e) => e.stage === "pageindex.tree" && e.phase === "end");
      const sel = lastWith(events, (e) => e.stage === "pageindex.select" && e.phase === "end");
      const rows: Row[] = [];
      if (tree) rows.push({ k: i.treeNodes, v: String(tree.data.nodes ?? 0) });
      if (sel) rows.push({ k: i.selectedSections, v: String(sel.data.count ?? 0) });
      return rows;
    }
    // 008 preview nodes have no live events to summarize.
    case "gateway":
    case "guardrails":
    case "cache":
    case "eval":
    case "observability":
    case "researcher":
    case "coder":
    case "critic":
    case "hybrid":
    case "summarization":
      return [];
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
