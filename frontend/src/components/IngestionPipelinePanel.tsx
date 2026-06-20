import { useMemo } from "react";

import { useT } from "../i18n";
import { selectIngestion } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { Caption, DetailShell, KeyVal, Mono, Section } from "./DetailShell";

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
          {ing.chunking.previews.length > 0 && (
            <>
              <Caption>{d.previews}</Caption>
              <Mono>{ing.chunking.previews.map((p, i) => `[${i}] ${p}`).join("\n")}</Mono>
            </>
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
