import { useMemo, useState } from "react";

import { useT } from "../i18n";
import { formatTokens, formatUsd } from "../lib/cost";
import { executionTree, type SpanChild, type TraceSpan } from "../lib/executionTree";
import { formatLatency } from "../lib/time";
import { useSimulator } from "../store/useSimulator";

// 038-execution-traces — a LangSmith-style hierarchical span tree, rendered in
// the Inspector body like a station detail (a ← Overview back button up top,
// opened from the "Execution traces" row in the Overview list). The header
// carries the run totals (wall-clock, tokens, cost); below, one row per
// pipeline-node occurrence (think/tools/generate appear once per ReAct round)
// with a proportional waterfall bar; LLM and tool nodes expand to the nested
// `ChatOpenAI` call / tool execution / RAG steps. Pure projection of
// `executionTree` over the store's events; tokens-only theming (theme guard).
export function ExecutionTracesDetail({ onBack }: { onBack: () => void }) {
  const t = useT();
  const i = t.inspector;
  const x = t.timeline.execTrace;
  const events = useSimulator((s) => s.events);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const tree = useMemo(() => executionTree(events), [events]);
  const hasRun = tree.spans.length > 0 && tree.totalMs > 0;

  const toggleSpan = (idx: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const childLabel = (c: SpanChild) =>
    c.label in x.child ? x.child[c.label as keyof typeof x.child] : c.label;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <button
        onClick={onBack}
        className="-mb-1 self-start rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
      >
        {i.overviewBack}
      </button>

      <div className="flex items-center gap-2.5">
        <span className="text-2xl" aria-hidden>
          🌳
        </span>
        <div className="flex-1">
          {/* Same fix as the station-detail title in InspectorPanel: force the
              ink color via inline style so it wins over any ancestor `color`
              in the cascade (Tailwind v4 emits utilities into @layer, which
              loses to an inline color on a parent). */}
          <div
            className="text-base font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            {x.title}
          </div>
          <div className="text-xs text-[var(--color-muted)]">{x.subtitle}</div>
        </div>
      </div>

      {hasRun ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            <Chip>{formatLatency(tree.totalMs)}</Chip>
            {tree.totalTokens > 0 && <Chip>🪙{formatTokens(tree.totalTokens)}</Chip>}
            {tree.totalCostUsd > 0 && <Chip>{formatUsd(tree.totalCostUsd)}</Chip>}
          </div>

          <div className="space-y-0.5 font-mono text-[11px]">
            {tree.spans.map((s, idx) => (
              <SpanRow
                key={idx}
                span={s}
                label={x.nodes[s.node]}
                detail={spanDetail(s, x.planTodos)}
                totalMs={tree.totalMs}
                collapsed={collapsed.has(idx)}
                onToggle={() => toggleSpan(idx)}
                childLabel={childLabel}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-muted)]">{x.empty}</p>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-0.5 tabular-nums text-[var(--color-label)]">
      {children}
    </span>
  );
}

// 062 — the parent-row tag for a DeepAgents span: the plan's todo count, or the
// file path / sub-agent type. Other nodes have no tag.
function spanDetail(span: TraceSpan, planTodos: string): string | undefined {
  if (span.node === "plan") return span.count !== undefined ? `${span.count} ${planTodos}` : undefined;
  return span.detail;
}

function SpanRow({
  span,
  label,
  detail,
  totalMs,
  collapsed,
  onToggle,
  childLabel,
}: {
  span: TraceSpan;
  label: string;
  detail?: string;
  totalMs: number;
  collapsed: boolean;
  onToggle: () => void;
  childLabel: (c: SpanChild) => string;
}) {
  const hasChildren = span.children.length > 0;
  return (
    <div>
      <Row
        depth={0}
        expandable={hasChildren}
        expanded={!collapsed}
        onToggle={onToggle}
        label={label}
        tag={detail}
        accent
        offsetMs={span.offsetMs}
        durationMs={span.durationMs}
        totalMs={totalMs}
        tokens={span.tokens}
      />
      {hasChildren &&
        !collapsed &&
        span.children.map((c, j) => (
          <Row
            key={j}
            depth={1}
            label={childLabel(c)}
            tag={c.model}
            offsetMs={c.offsetMs}
            durationMs={c.durationMs}
            totalMs={totalMs}
            tokens={c.tokens}
          />
        ))}
    </div>
  );
}

function Row({
  depth,
  label,
  tag,
  accent,
  expandable,
  expanded,
  onToggle,
  offsetMs,
  durationMs,
  totalMs,
  tokens,
}: {
  depth: number;
  label: string;
  tag?: string;
  accent?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  offsetMs: number;
  durationMs: number;
  totalMs: number;
  tokens?: number;
}) {
  const tip = tag ? `${label} · ${tag} · ${formatLatency(durationMs)}` : `${label} · ${formatLatency(durationMs)}`;
  return (
    <div className="flex items-center gap-2 py-0.5" title={tip}>
      <span
        className="flex w-[132px] shrink-0 items-center gap-1 truncate"
        style={{ paddingLeft: depth * 12 }}
      >
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="shrink-0 text-[var(--color-muted)] transition hover:text-[var(--color-sky-soft)]"
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="shrink-0 text-[var(--color-faint)]">·</span>
        )}
        <span className="truncate">
          <span className={accent ? "text-[var(--color-ink)]" : "text-[var(--color-text-soft)]"}>
            {label}
          </span>
          {tag && <span className="text-[var(--color-faint)]"> {tag}</span>}
        </span>
      </span>

      <Bar offsetMs={offsetMs} durationMs={durationMs} totalMs={totalMs} accent={accent} />

      <span className="w-[46px] shrink-0 text-right tabular-nums text-[var(--color-label)]">
        {formatLatency(durationMs)}
      </span>
      <span className="w-[40px] shrink-0 text-right">
        {tokens !== undefined && tokens > 0 ? <Tokens n={tokens} /> : null}
      </span>
    </div>
  );
}

function Bar({
  offsetMs,
  durationMs,
  totalMs,
  accent,
}: {
  offsetMs: number;
  durationMs: number;
  totalMs: number;
  accent?: boolean;
}) {
  const left = totalMs > 0 ? (offsetMs / totalMs) * 100 : 0;
  const width = totalMs > 0 ? (durationMs / totalMs) * 100 : 0;
  return (
    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
      <span
        className={`absolute inset-y-0 rounded-full ${
          accent
            ? "bg-[var(--color-sky-strong)]"
            : "bg-[color-mix(in_srgb,var(--color-sky)_55%,transparent)]"
        }`}
        style={{ left: `${left}%`, width: `${Math.max(width, durationMs > 0 ? 1.5 : 0)}%` }}
      />
    </span>
  );
}

function Tokens({ n }: { n: number }) {
  return (
    <span className="tabular-nums text-[var(--color-label)]" title={`${n} tokens`}>
      🪙{formatTokens(n)}
    </span>
  );
}
