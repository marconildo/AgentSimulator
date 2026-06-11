// 054-rag-block-expansion (amendment 3) — the per-stage detail view shown when a
// RAG pipeline card is clicked. Each stage renders its REAL trace data plus a small
// honest illustration of the algorithm: the query's real tokens → embedding vector
// (Embedding); a cosine-similarity vector-search plot built from each chunk's real
// similarity angle (Retrieval); the cross-encoder's before/after rank movement
// (Rerank); the exact context injected into the prompt (Augmented). Pure renderers
// over `RagStage.data` from `deriveRagPipeline` (no requests, no logic).

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useT } from "../i18n";
import { cosineAngleDeg, type PipelineChunk, type RagStage } from "../lib/ragPipeline";
import { tokenizePieces } from "../lib/tokenize";
import { RerankMovementList, type RerankMove } from "./InspectorPanel";

const RAG = "var(--color-ok)";
type RagStrings = ReturnType<typeof useT>["ragDetail"];

export function RagStageDetail({ stage }: { stage: RagStage }) {
  const t = useT();
  switch (stage.id) {
    case "chunking":
      return <ChunkingDetail data={stage.data} r={t.ragDetail} />;
    case "embedding":
      return <EmbeddingDetail data={stage.data} r={t.ragDetail} />;
    case "retrieval":
      return <RetrievalDetail data={stage.data} r={t.ragDetail} i={t.inspector} />;
    case "rerank":
      return <RerankDetail data={stage.data} status={stage.status} r={t.ragDetail} i={t.inspector} />;
    case "augmented":
      return <AugmentedDetail data={stage.data} r={t.ragDetail} />;
  }
}

// --- Chunking (offline precursor) -------------------------------------------

function ChunkingDetail({ data, r }: { data: Stage["data"]; r: RagStrings }) {
  return (
    <Wrap blurb={r.chunkingBlurb}>
      <Row k={r.offline} v={r.chunkConfig} />
      {typeof data.num_chunks === "number" && <Row k="chunks" v={String(data.num_chunks)} />}
    </Wrap>
  );
}

// --- Embedding (text → tokens → vector) -------------------------------------

function EmbeddingDetail({ data, r }: { data: Stage["data"]; r: RagStrings }) {
  const query = String(data.query ?? "");
  const preview = (data.preview as number[] | undefined) ?? [];
  const dim = (data.dim as number | undefined) ?? 0;
  const [tok, setTok] = useState<{ pieces: string[]; total: number }>({ pieces: [], total: 0 });

  useEffect(() => {
    let alive = true;
    tokenizePieces(query).then((res) => alive && setTok(res));
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <Wrap blurb={r.embeddingBlurb}>
      {query && (
        <Field label={r.inputLabel}>
          <p className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5 text-[11px] text-[var(--color-text-soft)]">
            {query}
          </p>
        </Field>
      )}
      {tok.pieces.length > 0 && (
        <Field label={`${r.tokensLabel} · ${r.tokenizerNote}`}>
          <div className="flex flex-wrap gap-1">
            {tok.pieces.map((p, idx) => (
              <span
                key={idx}
                className="rounded bg-[var(--color-line)] px-1 font-mono text-[10px] text-[var(--color-text-soft)]"
              >
                {p === " " ? "␣" : p.replace(/\n/g, "⏎")}
              </span>
            ))}
            {tok.total > tok.pieces.length && (
              <span className="text-[10px] text-[var(--color-faint)]">
                {r.showingOf(tok.pieces.length, tok.total)}
              </span>
            )}
          </div>
        </Field>
      )}
      {Boolean(data.model) && (
        <div className="grid grid-cols-2 gap-x-3">
          <Row k="model" v={String(data.model)} />
          <Row k="dim" v={String(dim)} />
        </div>
      )}
      {preview.length > 0 && (
        <Field label={r.vectorLabel(preview.length, dim)}>
          <VectorView values={preview} />
        </Field>
      )}
    </Wrap>
  );
}

// The query embedding shown as an actual vector: the literal `[ v0, v1, … ]`
// notation (first dozen values, signed) plus a heatmap strip where each dimension
// is a cell — green for positive, orange for negative, opacity by magnitude. A
// truncated slice of the real 1536-D vector (1536 cells won't fit).
function VectorView({ values }: { values: number[] }) {
  const max = Math.max(0.0001, ...values.map((v) => Math.abs(v)));
  const head = values.slice(0, 12);
  return (
    <div>
      <div className="overflow-x-auto whitespace-nowrap rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 font-mono text-[10.5px]">
        <span className="text-[var(--color-faint)]">[ </span>
        {head.map((v, i) => (
          <span key={i} style={{ color: v >= 0 ? "var(--color-ok-soft)" : "var(--color-warn)" }}>
            {v >= 0 ? " " : ""}
            {v.toFixed(3)}
            {i < head.length - 1 ? ", " : ""}
          </span>
        ))}
        <span className="text-[var(--color-faint)]"> , … ]</span>
      </div>
      {/* heatmap strip — one cell per dimension (the vector's "fingerprint") */}
      <div className="mt-1.5 flex h-6 w-full overflow-hidden rounded border border-[var(--color-line)]">
        {values.map((v, i) => (
          <div
            key={i}
            className="h-full flex-1"
            title={`dim ${i} · ${v.toFixed(4)}`}
            style={{
              background: v >= 0 ? "var(--color-ok)" : "var(--color-warn)",
              opacity: 0.2 + (Math.abs(v) / max) * 0.8,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// --- Retrieval (cosine vector search) ---------------------------------------

function RetrievalDetail({
  data,
  r,
  i,
}: {
  data: Stage["data"];
  r: RagStrings;
  i: ReturnType<typeof useT>["inspector"];
}) {
  const chunks = (data.chunks as PipelineChunk[] | undefined) ?? [];
  const candidates = (data.candidates as number | undefined) ?? chunks.length;
  const kept = (data.kept as number | undefined) ?? chunks.length;
  return (
    <Wrap blurb={r.retrievalBlurb}>
      <div className="grid grid-cols-3 gap-x-3">
        <Row k="metric" v={String(data.metric ?? "cosine")} />
        <Row k="k" v={String(data.k ?? "—")} />
        <Row k="candidates" v={String(candidates)} />
      </div>
      {kept < chunks.length && (
        <p className="text-[10.5px] text-[var(--color-text-soft)]">{r.keptNote(chunks.length, kept)}</p>
      )}
      {chunks.length > 0 && (
        <Field label={r.vectorSearch}>
          <CosinePlot chunks={chunks} r={r} />
          <p className="mt-1 flex items-center gap-1.5 text-[9.5px] text-[var(--color-text-soft)]">
            <span className="inline-block h-2 w-3 rounded-sm bg-[var(--color-ink)]" />
            {r.legend}
          </p>
          <p className="mt-1 font-mono text-[9.5px] text-[var(--color-faint)]">{r.cosineFormula}</p>
          <p className="mt-1 text-[9.5px] italic leading-snug text-[var(--color-label)]">{r.vizNote}</p>
          <p className="mt-1 text-[9.5px] italic leading-snug text-[var(--color-label)]">
            {r.chunkNote}
          </p>
        </Field>
      )}
      <div className="space-y-1">
        {chunks.map((c, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5"
          >
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 font-mono text-[var(--color-faint)]">#{c.rank ?? idx + 1}</span>
                <span className="truncate font-mono text-[var(--color-text-soft)]">{c.source}</span>
              </span>
              <span className="shrink-0 font-mono text-[var(--color-ok-soft)]">
                {(c.similarity ?? c.score).toFixed(3)}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--color-line)]">
              <div className="h-full" style={{ width: `${Math.max(0, (c.similarity ?? c.score) * 100)}%`, background: RAG }} />
            </div>
            {c.distance !== undefined && (
              <div className="mt-0.5 font-mono text-[9px] text-[var(--color-faint)]">
                {i.distance}: {c.distance.toFixed(4)}
              </div>
            )}
            {c.text && (
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[var(--color-muted)]">
                {c.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </Wrap>
  );
}

// A 2D illustration: the query vector along +x, each retrieved chunk drawn at its
// REAL cosine angle from the query (acos(similarity)), alternating above/below so
// the spread reads. Smaller angle = more similar = ranked higher.
function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function CosinePlot({ chunks, r }: { chunks: PipelineChunk[]; r: RagStrings }) {
  // A MONOTONIC one-sided fan: the query q runs horizontally from the origin near
  // the bottom-left, and every chunk fans UP from it at its REAL cosine angle
  // (acos(similarity)). So rank order reads cleanly — #1 hugs q (most similar),
  // each next vector opens wider (less similar). Vectors share one length on
  // purpose: embeddings are unit-normalised, so cosine depends only on the angle,
  // not magnitude. Zoom/pan (the `<g>` transform) lets you lean in; the closest
  // chunks are emphasised (green→blue closeness gradient, thicker stroke, halo #1).
  const W = 720;
  const H = 300;
  const ox = 40;
  const margin = 44;
  const oy = H - margin; // origin near the bottom; the fan opens upward
  const shown = chunks.slice(0, 10);
  const angles = shown.map((c) => cosineAngleDeg(c.similarity ?? c.score));
  const maxSin = Math.max(0.05, ...angles.map((a) => Math.sin((a * Math.PI) / 180)));
  const L = Math.min(250, (H - 2 * margin) / maxSin); // steepest vector still fits
  const sims = shown.map((c) => c.similarity ?? c.score);
  const maxSim = Math.max(0.0001, ...sims);
  const topAngle = angles[0] ?? 0;
  const arcR = 36;

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
  };

  // Wheel-zoom toward the cursor. Attached natively with `{ passive: false }`
  // because React's synthetic onWheel is passive, so its preventDefault is a no-op
  // (the page/canvas would still scroll/zoom under us).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = toSvg(e.clientX, e.clientY);
      setView((v) => {
        const scale = clampNum(v.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 0.6, 8);
        const k = scale / v.scale;
        return { scale, tx: x - (x - v.tx) * k, ty: y - (y - v.ty) * k };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Capture `d` into locals: the setView updater runs async (after batching), by
    // which point a pointerup may have nulled drag.current — reading it there crashed.
    const dx = ((e.clientX - d.cx) / rect.width) * W;
    const dy = ((e.clientY - d.cy) / rect.height) * H;
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="relative h-[300px] w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="block h-full w-full cursor-grab touch-none rounded-lg bg-[var(--color-panel-2)] active:cursor-grabbing"
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {/* query axis (q) along the bottom */}
          <line x1={ox} y1={oy} x2={W - 8} y2={oy} stroke="var(--color-line)" strokeDasharray="2 3" />
          <line
            x1={ox}
            y1={oy}
            x2={ox + L}
            y2={oy}
            stroke="var(--color-ink)"
            strokeWidth={3}
            markerEnd="url(#qhead)"
          />
          <text
            x={ox + L + 8}
            y={oy + 4}
            fontSize={12}
            fontWeight={700}
            fill="var(--color-ink)"
            fontFamily="monospace"
          >
            {r.queryLabel}
          </text>
          {/* arc + label for the top chunk's angle, between q and #1 */}
          {shown.length > 0 && (
            <>
              <path
                d={`M ${ox + arcR} ${oy} A ${arcR} ${arcR} 0 0 0 ${
                  ox + Math.cos((topAngle * Math.PI) / 180) * arcR
                } ${oy - Math.sin((topAngle * Math.PI) / 180) * arcR}`}
                fill="none"
                stroke="var(--color-faint)"
                strokeWidth={1}
              />
              <text
                x={ox + arcR + 6}
                y={oy - 10}
                fontSize={10}
                fill="var(--color-faint)"
                fontFamily="monospace"
              >
                {r.angleLabel} θ ≈ {Math.round(topAngle)}°
              </text>
            </>
          )}
          {/* chunk vectors — all fan UP from q, ordered by rank (monotonic). Only
              the top few are labelled; the rest (often a bunched low-similarity
              cluster) render as faint unlabelled lines to keep the plot readable.
              Drawn farthest-first so the closest (#1) sits on top. */}
          {shown
            .map((c, idx) => ({ c, idx }))
            .reverse()
            .map(({ c, idx }) => {
              const sim = sims[idx];
              const ang = (angles[idx] * Math.PI) / 180;
              const ex = ox + Math.cos(ang) * L;
              const ey = oy - Math.sin(ang) * L; // always upward
              const lead = idx === 0;
              const labelled = idx < 5; // only the top 5 carry a label
              // Closeness gradient: nearest (max similarity) → full green, farthest → blue.
              const pct = Math.round((sim / maxSim) * 100);
              const color = `color-mix(in srgb, var(--color-ok) ${pct}%, var(--color-blue))`;
              return (
                <g key={idx} opacity={labelled ? 1 : 0.5}>
                  <title>
                    {`#${idx + 1} ${c.source} · cosine ${sim.toFixed(3)} · θ ${Math.round(angles[idx])}°`}
                  </title>
                  {lead && <circle cx={ex} cy={ey} r={9} fill="var(--color-ok)" opacity={0.2} />}
                  <line
                    x1={ox}
                    y1={oy}
                    x2={ex}
                    y2={ey}
                    stroke={color}
                    strokeWidth={lead ? 2.4 : labelled ? 1.4 : 0.9}
                  />
                  <circle cx={ex} cy={ey} r={lead ? 4 : labelled ? 3 : 2} fill={color} />
                  {labelled && (
                    <text
                      x={ex + 6}
                      y={ey - 4}
                      fontSize={10}
                      fill="var(--color-muted)"
                      fontFamily="monospace"
                    >
                      #{idx + 1} {c.source} {sim.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
        <defs>
          <marker id="qhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-ink)" />
          </marker>
        </defs>
      </svg>
      <button
        type="button"
        onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
        className="absolute right-1 top-1 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
      >
        {r.resetView}
      </button>
      <span className="pointer-events-none absolute bottom-1 left-2 text-[8.5px] text-[var(--color-faint)]">
        {r.zoomHint}
      </span>
    </div>
  );
}

// --- Rerank (cross-encoder before/after) ------------------------------------

function RerankDetail({
  data,
  status,
  r,
  i,
}: {
  data: Stage["data"];
  status: RagStage["status"];
  r: RagStrings;
  i: ReturnType<typeof useT>["inspector"];
}) {
  if (status === "inactive")
    return (
      <Wrap blurb={r.rerankingBlurb}>
        <p className="text-[11px] italic text-[var(--color-label)]">{r.rerankInactive}</p>
      </Wrap>
    );
  const movement = (data.movement as RerankMove[] | undefined) ?? [];
  const fetchK = data.fetch_k as number | undefined;
  const k = data.k as number | undefined;
  const threshold = (data.threshold as number | undefined) ?? 0;
  return (
    <Wrap blurb={r.rerankingBlurb}>
      {Boolean(data.model) && <Row k={i.rerankModel} v={String(data.model)} />}
      {fetchK !== undefined && k !== undefined && (
        <p className="text-[10.5px] text-[var(--color-muted)]">{r.rerankPoolNote(fetchK, k)}</p>
      )}
      <Row k={r.thresholdLabel} v={threshold > 0 ? threshold.toFixed(2) : r.thresholdOff} />
      {threshold === 0 && (
        <p className="text-[10px] italic leading-snug text-[var(--color-label)]">
          {r.thresholdOffHint}
        </p>
      )}
      {movement.length > 0 && (
        <Field label={i.rerankMovement(movement.length)}>
          <RerankMovementList
            movement={movement}
            k={k ?? movement.length}
            i={i}
            threshold={threshold}
          />
        </Field>
      )}
    </Wrap>
  );
}

// --- Augmented (context injected into the prompt) ---------------------------

function AugmentedDetail({ data, r }: { data: Stage["data"]; r: RagStrings }) {
  const context = String(data.context ?? "");
  return (
    <Wrap blurb={r.augmentedBlurb}>
      <div className="grid grid-cols-2 gap-x-3">
        {data.retrievedTokens !== undefined && <Row k="retrieved" v={`${data.retrievedTokens} tok`} />}
        {data.window !== undefined && <Row k="window" v={`${Number(data.window).toLocaleString()} tok`} />}
      </div>
      {context && (
        <Field label={r.augmented}>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5 font-mono text-[10px] leading-snug text-[var(--color-muted)]">
            {context}
          </pre>
          <p className="mt-1 text-[10px] italic text-[var(--color-label)]">{r.contextInjected}</p>
        </Field>
      )}
    </Wrap>
  );
}

// --- shared layout helpers --------------------------------------------------

type Stage = RagStage;

function Wrap({ blurb, children }: { blurb: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{blurb}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--color-label)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
      <span className="shrink-0 text-[var(--color-label)]">{k}</span>
      <span className="truncate text-right font-mono text-[var(--color-text-soft)]">{v}</span>
    </div>
  );
}
