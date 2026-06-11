// 054-rag-block-expansion (amendment 3) — the per-stage detail view shown when a
// RAG pipeline card is clicked. Each stage renders its REAL trace data plus a small
// honest illustration of the algorithm: the query's real tokens → embedding vector
// (Embedding); a cosine-similarity vector-search plot built from each chunk's real
// similarity angle (Retrieval); the cross-encoder's before/after rank movement
// (Rerank); the exact context injected into the prompt (Augmented). Pure renderers
// over `RagStage.data` from `deriveRagPipeline` (no requests, no logic).

import { useEffect, useState, type ReactNode } from "react";

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
        <Field label={r.vectorLabel(dim)}>
          <VectorBars values={preview} />
        </Field>
      )}
    </Wrap>
  );
}

function VectorBars({ values }: { values: number[] }) {
  const max = Math.max(0.0001, ...values.map((v) => Math.abs(v)));
  return (
    <div className="space-y-0.5">
      {values.map((v, idx) => {
        const pct = (Math.abs(v) / max) * 50; // half-width max
        const positive = v >= 0;
        return (
          <div key={idx} className="flex items-center gap-1.5 font-mono text-[9px]">
            <span className="w-5 shrink-0 text-right text-[var(--color-faint)]">{idx}</span>
            <div className="relative h-2.5 flex-1 rounded bg-[var(--color-panel-2)]">
              <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--color-line)]" />
              <div
                className="absolute top-0 h-full rounded"
                style={{
                  left: positive ? "50%" : `${50 - pct}%`,
                  width: `${pct}%`,
                  background: positive ? RAG : "var(--color-warn)",
                }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[var(--color-muted)]">{v.toFixed(3)}</span>
          </div>
        );
      })}
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
  return (
    <Wrap blurb={r.retrievalBlurb}>
      <div className="grid grid-cols-3 gap-x-3">
        <Row k="metric" v={String(data.metric ?? "cosine")} />
        <Row k="k" v={String(data.k ?? "—")} />
        <Row k="candidates" v={String(data.candidates ?? chunks.length)} />
      </div>
      {chunks.length > 0 && (
        <Field label={r.vectorSearch}>
          <CosinePlot chunks={chunks} r={r} />
          <p className="mt-1 font-mono text-[9.5px] text-[var(--color-faint)]">{r.cosineFormula}</p>
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
          </div>
        ))}
      </div>
    </Wrap>
  );
}

// A 2D illustration: the query vector along +x, each retrieved chunk drawn at its
// REAL cosine angle from the query (acos(similarity)), alternating above/below so
// the spread reads. Smaller angle = more similar = ranked higher.
function CosinePlot({ chunks, r }: { chunks: PipelineChunk[]; r: RagStrings }) {
  const W = 330;
  const H = 168;
  const ox = 26;
  const oy = H / 2;
  const L = 132;
  const shown = chunks.slice(0, 6);
  const top = shown[0];
  const topAngle = top ? cosineAngleDeg(top.similarity ?? top.score) : 0;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg bg-[var(--color-panel-2)]">
      {/* axes */}
      <line x1={ox} y1={oy} x2={W - 6} y2={oy} stroke="var(--color-line)" strokeDasharray="2 3" />
      {/* query vector */}
      <line x1={ox} y1={oy} x2={ox + L} y2={oy} stroke="var(--color-ink)" strokeWidth={2} markerEnd="url(#qhead)" />
      <text x={ox + L + 2} y={oy - 4} fontSize={9} fill="var(--color-ink)" fontFamily="monospace">
        q
      </text>
      {shown.map((c, idx) => {
        const sim = c.similarity ?? c.score;
        const ang = (cosineAngleDeg(sim) * Math.PI) / 180;
        const sign = idx % 2 === 0 ? -1 : 1; // alternate up/down
        const ex = ox + Math.cos(ang) * L;
        const ey = oy + sign * Math.sin(ang) * L;
        const lead = idx === 0;
        const color = lead ? RAG : "var(--color-blue)";
        return (
          <g key={idx} opacity={lead ? 1 : 0.7}>
            <line x1={ox} y1={oy} x2={ex} y2={ey} stroke={color} strokeWidth={lead ? 1.6 : 1} />
            <circle cx={ex} cy={ey} r={3} fill={color} />
            <text x={ex + 4} y={ey + (sign < 0 ? -2 : 8)} fontSize={8} fill="var(--color-muted)" fontFamily="monospace">
              {c.source} {sim.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* angle arc for the top chunk */}
      {top && (
        <text x={ox + 30} y={oy - 6} fontSize={8.5} fill="var(--color-faint)" fontFamily="monospace">
          {r.angleLabel} θ ≈ {Math.round(topAngle)}°
        </text>
      )}
      <defs>
        <marker id="qhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-ink)" />
        </marker>
      </defs>
    </svg>
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
  return (
    <Wrap blurb={r.rerankingBlurb}>
      {Boolean(data.model) && <Row k={i.rerankModel} v={String(data.model)} />}
      {fetchK !== undefined && k !== undefined && (
        <p className="text-[10.5px] text-[var(--color-muted)]">{r.rerankPoolNote(fetchK, k)}</p>
      )}
      {movement.length > 0 && (
        <Field label={i.rerankMovement(movement.length)}>
          <RerankMovementList movement={movement} k={k ?? movement.length} i={i} />
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
