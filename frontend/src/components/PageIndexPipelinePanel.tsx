// 056-ragless-pageindex — a panel that floats beside the RAGLESS (PageIndex) node ON
// the canvas and lays out the reasoning-retrieval pipeline as a horizontal sequence of
// stage cards that light up live as the trace cursor reaches each one: Document tree →
// Navigate → Select → Augmented. No embeddings / vector search / rerank — retrieval is
// by reasoning over a document tree.
//
// Pure projection (mirrors RagPipelinePanel): it reads the event log + cursor from the
// store (so live streaming and step/replay share one path) and the RAGLESS node geometry
// from `layout.ts` mapped through the live React Flow viewport. Lives inside
// <ReactFlowProvider>. The `showRagless` layout flag is always true here — the panel only
// renders when the node is on the canvas (detail === "pageindex").

import { useViewport } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useT } from "../i18n";
import { computeLayout } from "../lib/layout";
import {
  derivePageIndexPipeline,
  type NavigatedNode,
  type PageIndexPipeline,
  type PageIndexStage,
  type PageIndexStageId,
  type PageIndexStageStatus,
  type SelectedSection,
} from "../lib/pageindexPipeline";
import { useResolvedSelection } from "../lib/selection";
import { useSimulator } from "../store/useSimulator";

const OK = "var(--color-ok)";
const PANEL_W = 720;
const GAP = 20;
const PAD = 14;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function PageIndexPipelinePanel() {
  const t = useT();
  const r = t.pageindexDetail;
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const status = useSimulator((s) => s.status);
  const expanded = useSimulator((s) => s.expanded);
  const closeDetail = useSimulator((s) => s.closeDetail);
  const sel = useResolvedSelection();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDetail]);

  const ranWithoutRetrieval =
    status === "done" && !events.some((e) => e.stage === "pageindex.tree");
  const { x: vx, y: vy, zoom } = useViewport();

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [panelH, setPanelH] = useState(0);
  const [picked, setPicked] = useState<PageIndexStageId | null>(null);

  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  // The panel is only mounted when the RAGLESS (`pageindex`) node is in the selection,
  // so the resolved selection already includes it in the layout.
  const layout = useMemo(() => computeLayout(expandedSet, sel), [expandedSet, sel]);
  const pipeline = useMemo(() => derivePageIndexPipeline(events, cursor), [events, cursor]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainer({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeId = currentStageId(pipeline);
  const selectedId = picked ?? activeId;
  const selected = pipeline.stages.find((s) => s.id === selectedId) ?? pipeline.stages[0];

  useLayoutEffect(() => {
    if (panelRef.current) setPanelH(panelRef.current.offsetHeight);
  }, [pipeline, selectedId, container.w, container.h, zoom, vx, vy]);

  const anchor = useMemo(() => {
    const pos = layout.positions.pageindex;
    if (!pos || !container.w) return null;
    const sx = pos.x * zoom + vx;
    const sy = pos.y * zoom + vy;
    const sw = layout.widths.pageindex * zoom;
    const sh = layout.heights.pageindex * zoom;
    let left = sx + sw + GAP;
    if (left + PANEL_W > container.w - PAD) left = sx - PANEL_W - GAP;
    left = clamp(left, PAD, Math.max(PAD, container.w - PANEL_W - PAD));
    const top = clamp(sy + sh / 2 - panelH / 2, PAD, Math.max(PAD, container.h - panelH - PAD));
    return { left, top };
  }, [layout, container, panelH, vx, vy, zoom]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>
        {anchor && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            style={{ left: anchor.left, top: anchor.top, width: PANEL_W }}
            className="pointer-events-auto absolute rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_97%,transparent)] p-3 shadow-xl backdrop-blur-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">🧭</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[var(--color-ink)]">{r.title}</div>
                <div className="truncate text-[10.5px] text-[var(--color-muted)]">{r.subtitle}</div>
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closeDetail();
                }}
                aria-label={r.close}
                className="pointer-events-auto rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[12px] text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)]"
              >
                ✕
              </button>
            </div>

            {!pipeline.started ? (
              <div className="flex h-[120px] items-center justify-center px-4 text-center text-[12px] text-[var(--color-muted)]">
                {ranWithoutRetrieval ? r.noRetrieval : r.empty}
              </div>
            ) : (
              <>
                <div className="flex items-stretch gap-1" title={r.clickHint}>
                  {pipeline.stages.map((stage, idx) => (
                    <div key={stage.id} className="flex min-w-0 flex-1 items-stretch">
                      <StageCard
                        stage={stage}
                        r={r}
                        selected={stage.id === selectedId}
                        onClick={() => setPicked(stage.id)}
                      />
                      {idx < pipeline.stages.length - 1 && <Arrow status={stage.status} />}
                    </div>
                  ))}
                </div>
                <div className="mt-2 max-h-[480px] overflow-y-auto border-t border-[var(--color-line)] pt-2">
                  <StageDetail stage={selected} r={r} />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type PiStrings = ReturnType<typeof useT>["pageindexDetail"];

const TITLE: Record<PageIndexStage["id"], (r: PiStrings) => string> = {
  tree: (r) => r.tree,
  navigate: (r) => r.navigate,
  select: (r) => r.select,
  augmented: (r) => r.augmented,
};

function StageCard({
  stage,
  r,
  selected,
  onClick,
}: {
  stage: PageIndexStage;
  r: PiStrings;
  selected: boolean;
  onClick: () => void;
}) {
  const active = stage.status === "active";
  const done = stage.status === "done";
  const dim = stage.status === "pending";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      animate={active ? { boxShadow: `0 0 0 2px ${OK}` } : { boxShadow: "0 0 0 0 transparent" }}
      transition={active ? { repeat: Infinity, repeatType: "reverse", duration: 0.8 } : { duration: 0.2 }}
      className="flex min-w-0 flex-1 flex-col rounded-xl border p-2 text-left transition hover:border-[var(--color-ok)]"
      style={{
        borderColor: selected || done || active ? OK : "var(--color-line)",
        borderWidth: selected ? 1.5 : 1,
        opacity: dim && !selected ? 0.62 : 1,
        background: selected
          ? "color-mix(in srgb, var(--color-ok) 12%, transparent)"
          : done
            ? "color-mix(in srgb, var(--color-ok) 7%, transparent)"
            : "var(--color-panel-2)",
      }}
    >
      <div className="flex items-center gap-1">
        <StatusDot status={stage.status} />
        <span className="truncate text-[11px] font-semibold text-[var(--color-ink)]">
          {TITLE[stage.id](r)}
        </span>
      </div>
      <div className="mt-1 min-h-[40px] text-[10px] leading-snug text-[var(--color-muted)]">
        <StageBody stage={stage} r={r} />
      </div>
    </motion.button>
  );
}

function currentStageId(pipeline: PageIndexPipeline): PageIndexStageId {
  const active = pipeline.stages.find((s) => s.status === "active");
  if (active) return active.id;
  const done = [...pipeline.stages].reverse().find((s) => s.status === "done");
  return done?.id ?? pipeline.stages[0].id;
}

function StageBody({ stage, r }: { stage: PageIndexStage; r: PiStrings }): ReactNode {
  const d = stage.data;
  switch (stage.id) {
    case "tree":
      return typeof d.nodes === "number" ? (
        <span className="font-mono text-[var(--color-text-soft)]">
          {r.nodesLabel(d.nodes as number, (d.leaves as number) ?? 0)}
        </span>
      ) : (
        <Pending />
      );
    case "navigate": {
      const navigated = (d.navigatedNodes as NavigatedNode[] | undefined) ?? [];
      if (!d.reasoning) return <Pending />;
      return (
        <>
          {navigated.length > 0 && (
            <div className="mb-0.5 font-mono text-[var(--color-ok-soft)]">→ {navigated.length} node{navigated.length === 1 ? "" : "s"}</div>
          )}
          <span className="line-clamp-2 text-[var(--color-text-soft)]">{String(d.reasoning)}</span>
        </>
      );
    }
    case "select": {
      const chunks = (d.chunks as SelectedSection[] | undefined) ?? [];
      return typeof d.count === "number" ? (
        <Kv k="sections" v={`${d.count}`} sub={chunks[0]?.source} />
      ) : (
        <Pending />
      );
    }
    case "augmented":
      return d.retrievedTokens !== undefined ? (
        <>
          <Kv k="retrieved" v={`${d.retrievedTokens} tok`} />
          <span className="font-mono text-[var(--color-ok-soft)]">{r.toLlm}</span>
        </>
      ) : (
        <span className="text-[var(--color-faint)]">{r.augmentedBlurb}</span>
      );
  }
}

// Per-stage drill-in: real data + a one-line explanation of the algorithm.
function StageDetail({ stage, r }: { stage: PageIndexStage; r: PiStrings }): ReactNode {
  const d = stage.data;
  switch (stage.id) {
    case "tree":
      return (
        <DetailWrap blurb={r.treeBlurb}>
          {Array.isArray((d.tree as { children?: unknown[] })?.children) && (
            <TreeView node={d.tree as TreeNode} />
          )}
        </DetailWrap>
      );
    case "navigate": {
      const navigated = (d.navigatedNodes as NavigatedNode[] | undefined) ?? [];
      const highlight = new Set((d.selected as string[] | undefined) ?? []);
      return (
        <DetailWrap blurb={r.navigateBlurb}>
          {d.query != null && <Field label={r.queryLabel} value={String(d.query)} mono />}
          {d.reasoning != null && <Field label={r.reasoningLabel} value={String(d.reasoning)} />}
          {navigated.length > 0 && (
            <div className="mt-1.5">
              <div className="text-[10px] font-semibold text-[var(--color-label)]">
                {r.navigatedTo}
                {typeof d.model === "string" && (
                  <span className="ml-1.5 font-normal text-[var(--color-faint)]">· {d.model}</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {navigated.map((n) => (
                  <span
                    key={n.id}
                    className="rounded-full border border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_12%,transparent)] px-1.5 py-px text-[10px] text-[var(--color-ok-soft)]"
                  >
                    <span className="font-mono text-[9px] opacity-70">{n.id}</span> {n.title}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* The tree with the navigated path highlighted (rest dimmed) — the "tree
              search" made visible: the LLM walked the ToC to these nodes. */}
          {d.tree != null && (
            <div className="mt-2 max-h-[220px] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
              <TreeView node={d.tree as TreeNode} highlight={highlight} />
            </div>
          )}
        </DetailWrap>
      );
    }
    case "select": {
      const chunks = (d.chunks as SelectedSection[] | undefined) ?? [];
      return (
        <DetailWrap blurb={r.selectBlurb}>
          <div className="text-[10.5px] font-semibold text-[var(--color-label)]">
            {r.selectedLabel}
          </div>
          <ul className="mt-1 space-y-1.5">
            {chunks.map((c, i) => (
              <li
                key={c.node_id ?? i}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-[var(--color-ok-soft)]">
                    {c.source}
                  </span>
                  {c.title && (
                    <span className="truncate text-[10px] text-[var(--color-muted)]">{c.title}</span>
                  )}
                </div>
                <div className="mt-1 line-clamp-3 text-[10.5px] leading-snug text-[var(--color-text-soft)]">
                  {c.text}
                </div>
              </li>
            ))}
          </ul>
        </DetailWrap>
      );
    }
    case "augmented":
      return (
        <DetailWrap blurb={r.augmentedBlurb}>
          {typeof d.context === "string" && d.context && (
            <pre className="mt-1 max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 font-mono text-[10px] leading-snug text-[var(--color-text-soft)]">
              {d.context}
            </pre>
          )}
        </DetailWrap>
      );
  }
}

interface TreeNode {
  id: string;
  title: string;
  level: number;
  source: string;
  snippet?: string;
  children?: TreeNode[];
}

function TreeView({ node, highlight }: { node: TreeNode; highlight?: Set<string> }) {
  return (
    <ul className="text-[10.5px] leading-snug">
      {(node.children ?? []).map((child) => (
        <TreeBranch key={child.id} node={child} depth={0} highlight={highlight} />
      ))}
    </ul>
  );
}

function TreeBranch({
  node,
  depth,
  highlight,
}: {
  node: TreeNode;
  depth: number;
  highlight?: Set<string>;
}) {
  // When a highlight set is given, the navigated-to nodes stand out and the rest is
  // dimmed — so the Navigate view reads as the path the LLM reasoned to.
  const lit = highlight?.has(node.id) ?? false;
  const dimmed = highlight && highlight.size > 0 && !lit;
  return (
    <li style={{ paddingLeft: depth * 12, opacity: dimmed ? 0.45 : 1 }}>
      <span className="font-mono text-[9.5px] text-[var(--color-faint)]">{node.id}</span>{" "}
      <span
        className={lit ? "font-semibold text-[var(--color-ok-soft)]" : "text-[var(--color-text-soft)]"}
      >
        {lit ? "▸ " : ""}
        {node.title}
      </span>
      {node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <TreeBranch key={c.id} node={c} depth={depth + 1} highlight={highlight} />
          ))}
        </ul>
      )}
    </li>
  );
}

function DetailWrap({ blurb, children }: { blurb: string; children?: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] italic leading-snug text-[var(--color-muted)]">{blurb}</p>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-1.5">
      <div className="text-[10px] font-semibold text-[var(--color-label)]">{label}</div>
      <div
        className={`mt-0.5 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5 text-[10.5px] leading-snug text-[var(--color-text-soft)] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Kv({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="truncate">
      <span className="text-[var(--color-label)]">{k}</span>{" "}
      <span className="font-mono text-[var(--color-text-soft)]">{v}</span>
      {sub && <span className="ml-1 text-[var(--color-faint)]">{sub}</span>}
    </div>
  );
}

function Pending() {
  return <span className="text-[var(--color-faint)]">…</span>;
}

function StatusDot({ status }: { status: PageIndexStageStatus }) {
  const color = status === "done" || status === "active" ? OK : "var(--color-line)";
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

function Arrow({ status }: { status: PageIndexStageStatus }) {
  const lit = status === "done" || status === "active";
  return (
    <div className="flex w-3 items-center justify-center self-center">
      <span className="text-[12px]" style={{ color: lit ? OK : "var(--color-line)" }}>
        →
      </span>
    </div>
  );
}
