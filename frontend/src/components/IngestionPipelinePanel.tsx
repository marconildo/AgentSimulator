import { useMemo, useState } from "react";

import { useT } from "../i18n";
import { selectIngestion } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { Caption, DetailShell, KeyVal, Mono, Scroll, Section } from "./DetailShell";

// 080-ingestion-pipeline-merge — the "Open ingestion pipeline" drill-in. Walks the
// six write-path phases of an upload in order (object store → chunk → tokenize →
// embed → metadata → vector DB), each from the real trace data. The standalone
// Object Storage node was folded into the indexer (080), so its durable write is
// the first phase here. Pure projection of the captured trace, driven by the same
// cursor as the canvas (step/replay safe), mirroring the RAG pipeline overlay.

const OK = "var(--color-ok)";

export function IngestionPipelinePanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const d = t.ingestionDetail;

  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );
  const ing = useMemo(() => selectIngestion(visible), [visible]);

  return (
    <DetailShell
      accent={OK}
      icon="📥"
      title={d.title}
      subtitle={d.subtitle}
      back={d.back}
      onClose={onClose}
      empty={!ing.any}
      emptyText={d.empty}
    >
      {/* 1) Object store — the durable original write (was its own node pre-080). */}
      {ing.objectStore && (
        <Section title={`1 · ${d.objectStore}`} accent={OK}>
          {ing.objectStore.filename && <KeyVal k={d.filename} v={ing.objectStore.filename} />}
          {ing.objectStore.key && <KeyVal k={d.objectKey} v={ing.objectStore.key} />}
          {typeof ing.objectStore.sizeBytes === "number" && (
            <KeyVal k={d.size} v={`${ing.objectStore.sizeBytes.toLocaleString()} B`} />
          )}
          {ing.objectStore.contentType && (
            <KeyVal k={d.contentType} v={ing.objectStore.contentType} />
          )}
        </Section>
      )}

      {/* 2) Chunking — the active strategy and its boundaries. */}
      {ing.chunking && (
        <Section title={`2 · ${d.chunking}`} accent={OK}>
          {ing.chunking.strategy && <KeyVal k={d.strategy} v={ing.chunking.strategy} />}
          {typeof ing.chunking.numChunks === "number" && (
            <KeyVal k={d.chunks} v={String(ing.chunking.numChunks)} />
          )}
          {typeof ing.chunking.chunkSize === "number" && (
            <KeyVal k={d.chunkSize} v={String(ing.chunking.chunkSize)} />
          )}
          {typeof ing.chunking.chunkOverlap === "number" && (
            <KeyVal k={d.overlap} v={String(ing.chunking.chunkOverlap)} />
          )}
          {typeof ing.chunking.totalChars === "number" && (
            <KeyVal k={d.totalChars} v={ing.chunking.totalChars.toLocaleString()} />
          )}
          {ing.chunking.chunks.length > 0 && (
            <ChunkTable
              chunks={ing.chunking.chunks}
              tokenCounts={ing.tokenization?.tokenCounts ?? []}
              labels={d}
            />
          )}
        </Section>
      )}

      {/* 3) Tokenization — per-chunk cl100k token counts. */}
      {ing.tokenization && (
        <Section title={`3 · ${d.tokenization}`} accent={OK}>
          {ing.tokenization.encoding && <KeyVal k={d.encoding} v={ing.tokenization.encoding} />}
          {typeof ing.tokenization.totalTokens === "number" && (
            <KeyVal k={d.totalTokens} v={String(ing.tokenization.totalTokens)} />
          )}
          {ing.tokenization.tokenCounts.length > 0 && (
            <>
              <Caption>{d.perChunkTokens}</Caption>
              <Mono>{ing.tokenization.tokenCounts.join(" · ")}</Mono>
            </>
          )}
        </Section>
      )}

      {/* 4) Embedding — model + a vector preview. */}
      {ing.embedding && (
        <Section title={`4 · ${d.embedding}`} accent={OK}>
          {ing.embedding.model && <KeyVal k={d.model} v={ing.embedding.model} />}
          {typeof ing.embedding.dim === "number" && (
            <KeyVal k={d.dimension} v={String(ing.embedding.dim)} />
          )}
          {typeof ing.embedding.numVectors === "number" && (
            <KeyVal k={d.vectors} v={String(ing.embedding.numVectors)} />
          )}
          {ing.embedding.preview.length > 0 && (
            <>
              <Caption>{d.vectorPreview}</Caption>
              <Mono>[{ing.embedding.preview.join(", ")}, …]</Mono>
            </>
          )}
        </Section>
      )}

      {/* 5) Metadata extraction — the per-chunk records persisted with the vectors. */}
      {ing.metadata && (
        <Section title={`5 · ${d.metadata}`} accent={OK}>
          {ing.metadata.docType && <KeyVal k={d.docType} v={ing.metadata.docType} />}
          {typeof ing.metadata.numRecords === "number" && (
            <KeyVal k={d.records} v={String(ing.metadata.numRecords)} />
          )}
          {ing.metadata.metadataKeys.length > 0 && (
            <KeyVal k={d.keys} v={ing.metadata.metadataKeys.join(", ")} />
          )}
          {ing.metadata.records.length > 0 && (
            <Mono>{JSON.stringify(ing.metadata.records[0], null, 2)}</Mono>
          )}
        </Section>
      )}

      {/* 6) Save to vector DB — the upsert into the index. */}
      {ing.store && (
        <Section title={`6 · ${d.store}`} accent={OK}>
          {ing.store.collection && <KeyVal k={d.collection} v={ing.store.collection} />}
          {typeof ing.store.chunksStored === "number" && (
            <KeyVal k={d.stored} v={String(ing.store.chunksStored)} />
          )}
          {typeof ing.store.totalInCollection === "number" && (
            <KeyVal k={d.totalInCollection} v={String(ing.store.totalInCollection)} />
          )}
        </Section>
      )}
    </DetailShell>
  );
}

// 083 — every chunk as a selectable row; clicking one opens its full text below.
// Tokens are joined positionally from the tokenize phase when present. Pure
// presentation over the already-projected chunk list (legacy traces with only
// previews still render — the rows just show the truncated text).
// A one-line, real truncation for the row snippet (the full text lives only in
// the selected-chunk panel below — so the table stays a preview, honestly).
const SNIPPET_CHARS = 80;
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS)}…` : flat;
}

type ChunkLabels = {
  chunkTableCaption: string;
  colNum: string;
  colChars: string;
  colTokens: string;
  colSnippet: string;
  selectChunkHint: string;
  fullChunkText: string;
};

function ChunkTable({
  chunks,
  tokenCounts,
  labels,
}: {
  chunks: string[];
  tokenCounts: number[];
  labels: ChunkLabels;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const hasTokens = tokenCounts.length === chunks.length;

  return (
    <>
      <Caption>{labels.chunkTableCaption}</Caption>
      <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
        <div
          className="grid items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]"
          style={{ gridTemplateColumns: "2rem 3.5rem 3.5rem 1fr" }}
        >
          <span>{labels.colNum}</span>
          <span className="text-right">{labels.colChars}</span>
          <span className="text-right">{labels.colTokens}</span>
          <span>{labels.colSnippet}</span>
        </div>
        {chunks.map((c, i) => {
          const active = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(active ? null : i)}
              aria-pressed={active}
              className={`grid w-full items-center gap-2 border-b border-[var(--color-line)] px-2 py-1 text-left text-[12px] transition last:border-b-0 ${
                active
                  ? "bg-[color-mix(in_srgb,var(--color-ok)_14%,transparent)]"
                  : "hover:bg-[var(--color-panel-2)]"
              }`}
              style={{ gridTemplateColumns: "2rem 3.5rem 3.5rem 1fr" }}
            >
              <span className="font-mono text-[var(--color-muted)]">{i}</span>
              <span className="text-right font-mono text-[var(--color-ink)]">{c.length}</span>
              <span className="text-right font-mono text-[var(--color-muted)]">
                {hasTokens ? tokenCounts[i] : "—"}
              </span>
              <span className="truncate text-[var(--color-text-soft)]">{snippet(c)}</span>
            </button>
          );
        })}
      </div>
      {selected === null ? (
        <div className="mt-2 text-[11px] italic text-[var(--color-muted)]">
          {labels.selectChunkHint}
        </div>
      ) : (
        <>
          <Caption>{`${labels.fullChunkText} · [${selected}]`}</Caption>
          <Scroll>{chunks[selected]}</Scroll>
        </>
      )}
    </>
  );
}
