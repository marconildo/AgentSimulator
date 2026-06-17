// 054-rag-block-expansion (RAG block redesign) — a wide panel that floats beside
// the Vector DB node ON the canvas (so the rest of the flow stays visible) and lays
// out the query-time RAG pipeline as a horizontal sequence of stage cards that light
// up live as the trace cursor reaches each one: Embedding → Retrieval → Rerank →
// Augmented, with Chunking shown as the offline (ingestion) precursor.
//
// Pure projection: it reads the event log + cursor from the store (so live streaming
// and step/replay share the same path) and the node geometry from `layout.ts` mapped
// through the live React Flow viewport (the same anchoring TourCaption uses), so the
// panel tracks the Vector DB node across pan/zoom. It lives inside <ReactFlowProvider>.

import { useViewport } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useT } from "../i18n";
import { computeLayout } from "../lib/layout";
import {
  deriveRagPipeline,
  type RagPipeline,
  type RagStage,
  type RagStageId,
  type RagStageStatus,
} from "../lib/ragPipeline";
import { useResolvedSelection } from "../lib/selection";
import { useSimulator } from "../store/useSimulator";
import { RagStageDetail } from "./RagStageDetail";

const RAG = "var(--color-ok)";
const PANEL_W = 760;
const GAP = 20;
const PAD = 14;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function RagPipelinePanel() {
  const t = useT();
  const r = t.ragDetail;
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const status = useSimulator((s) => s.status);
  const expanded = useSimulator((s) => s.expanded);
  const closeDetail = useSimulator((s) => s.closeDetail);
  const sel = useResolvedSelection();

  // Esc closes the panel — a reliable close path beside the ✕ and the node toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDetail]);

  // A run finished without ever retrieving → tell the user the agent skipped the KB
  // (otherwise the empty "send a message" copy is misleading after a real turn).
  const ranWithoutRetrieval =
    status === "done" && !events.some((e) => e.stage === "rag.embed" || e.stage === "rag.search");
  const { x: vx, y: vy, zoom } = useViewport();

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [panelH, setPanelH] = useState(0);
  // Which stage card is drilled into. `null` = follow the live cursor (the active
  // or latest-completed stage); clicking a card pins it until another is clicked.
  const [picked, setPicked] = useState<RagStageId | null>(null);

  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const layout = useMemo(() => computeLayout(expandedSet, sel), [expandedSet, sel]);
  const pipeline = useMemo(() => deriveRagPipeline(events, cursor), [events, cursor]);

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

  // Map the Vector DB node's laid-out rect through the viewport, prefer the right
  // side (the open area in the data column), flip left if it would overflow, and
  // clamp inside the canvas so the panel is always fully visible.
  const anchor = useMemo(() => {
    const pos = layout.positions.rag;
    if (!pos || !container.w) return null;
    const sx = pos.x * zoom + vx;
    const sy = pos.y * zoom + vy;
    const sw = layout.widths.rag * zoom;
    const sh = layout.heights.rag * zoom;
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
              <span className="text-lg">📚</span>
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
                {/* The drilled-in detail of the selected stage (real data + an
                    illustration of the algorithm). Scrolls if it outgrows the panel. */}
                <div className="mt-2 max-h-[480px] overflow-y-auto border-t border-[var(--color-line)] pt-2">
                  <RagStageDetail stage={selected} />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- one stage card ---------------------------------------------------------

type RagStrings = ReturnType<typeof useT>["ragDetail"];

const TITLE: Record<RagStage["id"], (r: RagStrings) => string> = {
  chunking: (r) => r.chunking,
  embedding: (r) => r.embedding,
  retrieval: (r) => r.retrieval,
  rerank: (r) => r.reranking,
  augmented: (r) => r.augmented,
};

function StageCard({
  stage,
  r,
  selected,
  onClick,
}: {
  stage: RagStage;
  r: RagStrings;
  selected: boolean;
  onClick: () => void;
}) {
  const active = stage.status === "active";
  const done = stage.status === "done";
  const dim = stage.status === "offline" || stage.status === "inactive" || stage.status === "pending";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      animate={active ? { boxShadow: `0 0 0 2px ${RAG}` } : { boxShadow: "0 0 0 0 transparent" }}
      transition={active ? { repeat: Infinity, repeatType: "reverse", duration: 0.8 } : { duration: 0.2 }}
      className="flex min-w-0 flex-1 flex-col rounded-xl border p-2 text-left transition hover:border-[var(--color-ok)]"
      style={{
        borderColor: selected || done || active ? RAG : "var(--color-line)",
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

// The stage to show by default: the one firing now (active), else the most recent
// completed stage, else the first — so the detail follows the live run, and a
// settled run lands on the last real stage (Augmented).
function currentStageId(pipeline: RagPipeline): RagStageId {
  const active = pipeline.stages.find((s) => s.status === "active");
  if (active) return active.id;
  const done = [...pipeline.stages].reverse().find((s) => s.status === "done");
  return done?.id ?? pipeline.stages[0].id;
}

function StageBody({ stage, r }: { stage: RagStage; r: RagStrings }): ReactNode {
  const d = stage.data;
  switch (stage.id) {
    case "chunking":
      return (
        <span className="font-mono uppercase tracking-wide text-[var(--color-faint)]">
          {typeof d.num_chunks === "number" ? `${d.num_chunks} chunks` : r.offline}
        </span>
      );
    case "embedding":
      return d.model ? (
        <Kv k="model" v={String(d.model)} sub={typeof d.dim === "number" ? `${d.dim}d` : undefined} />
      ) : (
        <Pending />
      );
    case "retrieval": {
      const top = d.top as { source: string; score: number } | undefined;
      return d.k !== undefined ? (
        <>
          <Kv k="k" v={`${d.k}${typeof d.candidates === "number" ? ` · ${d.candidates} cand` : ""}`} />
          {top && <Kv k="top" v={`${top.source} ${top.score.toFixed(2)}`} />}
        </>
      ) : (
        <Pending />
      );
    }
    case "rerank":
      if (stage.status === "inactive")
        return <span className="italic text-[var(--color-label)]">{r.rerankInactive}</span>;
      return d.fetch_k !== undefined ? (
        <Kv k="pool→k" v={`${d.fetch_k}→${d.k}`} sub="reranked" />
      ) : (
        <Pending />
      );
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

function StatusDot({ status }: { status: RagStageStatus }) {
  const color =
    status === "done" || status === "active"
      ? RAG
      : status === "offline" || status === "inactive"
        ? "var(--color-faint)"
        : "var(--color-line)";
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

function Arrow({ status }: { status: RagStageStatus }) {
  const lit = status === "done" || status === "active";
  return (
    <div className="flex w-3 items-center justify-center self-center">
      <span className="text-[12px]" style={{ color: lit ? RAG : "var(--color-line)" }}>
        →
      </span>
    </div>
  );
}
