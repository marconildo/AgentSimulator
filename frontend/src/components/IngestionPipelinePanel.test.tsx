/** @vitest-environment jsdom */
// 080-ingestion-pipeline-merge — the "Open ingestion pipeline" drill-in (AC7).
// Walks the six write-path phases of an upload in order, each projected purely
// from the captured trace (no extra request). Object storage is the first phase
// (folded in from the old standalone node).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IngestionPipelinePanel } from "./IngestionPipelinePanel";
import { selectIngestion } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// Full chunk texts > 80 chars so the row snippet truncates — the distinctive
// trailing phrase then appears ONLY in the selected-chunk full-text panel.
const CHUNK_TEXTS = [
  "Vectors capture meaning in a high-dimensional space where similar ideas sit close, the first chunk marker.",
  "Cosine similarity ranks the stored vectors by their closeness to the query, the second chunk marker.",
  "Small overlapping chunks preserve the surrounding context so no idea is lost, the third chunk marker.",
];

function uploadTurn(): TraceEvent[] {
  seq = 0;
  return [
    ev("storage.upload", "end", {
      filename: "notes.pdf",
      key: "s/d/notes.pdf",
      size_bytes: 2048,
      content_type: "application/pdf",
    }),
    ev("rag.ingest.chunk", "end", {
      strategy: "recursive",
      num_chunks: 3,
      chunk_size: 900,
      chunk_overlap: 150,
      total_chars: 2400,
      previews: ["Vectors capture meaning", "Cosine ranks them"],
      chunk_texts: CHUNK_TEXTS,
    }),
    ev("rag.ingest.tokenize", "end", {
      encoding: "cl100k_base",
      token_counts: [120, 98, 75],
      total_tokens: 293,
    }),
    ev("rag.ingest.embed", "end", {
      model: "text-embedding-3-small",
      dim: 1536,
      num_vectors: 3,
      preview: [0.1, 0.2, 0.3],
    }),
    ev("rag.ingest.metadata", "end", {
      doc_type: "pdf",
      metadata_keys: ["session_id", "document_id", "position"],
      num_records: 3,
      records: [{ chunk: 0, position: "1 of 3" }],
    }),
    ev("rag.ingest.store", "end", {
      collection: "ai_engineering",
      chunks_stored: 3,
      total_in_collection: 42,
    }),
  ];
}

function seed(events: TraceEvent[]): void {
  useSimulator.setState({ events, cursor: events.length - 1 });
}

afterEach(() => {
  cleanup();
  useSimulator.setState({ events: [], cursor: -1 });
});

describe("selectIngestion (080 AC7)", () => {
  it("projects all six phases from an upload trace", () => {
    const ing = selectIngestion(uploadTurn());
    expect(ing.any).toBe(true);
    expect(ing.objectStore?.filename).toBe("notes.pdf");
    expect(ing.chunking?.strategy).toBe("recursive");
    expect(ing.tokenization?.totalTokens).toBe(293);
    expect(ing.embedding?.dim).toBe(1536);
    expect(ing.metadata?.numRecords).toBe(3);
    expect(ing.store?.chunksStored).toBe(3);
    // 083 — full chunk texts projected for the table.
    expect(ing.chunking?.chunks).toEqual(CHUNK_TEXTS);
  });

  it("falls back to previews when chunk_texts is absent (083 AC4)", () => {
    seq = 0;
    const ing = selectIngestion([
      ev("rag.ingest.chunk", "end", { num_chunks: 2, previews: ["aaa", "bbb"] }),
    ]);
    expect(ing.chunking?.chunks).toEqual(["aaa", "bbb"]);
  });

  it("is empty for a non-upload log", () => {
    seq = 0;
    const ing = selectIngestion([ev("agent.route", "end"), ev("llm.generate", "end")]);
    expect(ing.any).toBe(false);
  });
});

describe("IngestionPipelinePanel — phase walk (080 AC7)", () => {
  it("renders the six phases in order", () => {
    seed(uploadTurn());
    render(<IngestionPipelinePanel onClose={vi.fn()} />);
    for (const title of [
      /1 · Object store/,
      /2 · Chunking/,
      /3 · Tokenization/,
      /4 · Embedding/,
      /5 · Metadata extraction/,
      /6 · Save to vector DB/,
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("shows real per-phase data", () => {
    seed(uploadTurn());
    render(<IngestionPipelinePanel onClose={vi.fn()} />);
    expect(screen.getByText("notes.pdf")).toBeTruthy();
    expect(screen.getByText("recursive")).toBeTruthy();
    expect(screen.getByText("text-embedding-3-small")).toBeTruthy();
    expect(screen.getByText("ai_engineering")).toBeTruthy();
    expect(screen.getByText(/120 · 98 · 75/)).toBeTruthy();
  });

  it("lists every chunk as a row and opens one in full on click (083)", () => {
    seed(uploadTurn());
    render(<IngestionPipelinePanel onClose={vi.fn()} />);

    // One row per chunk: each chunk's char count is shown (AC1).
    for (const c of CHUNK_TEXTS) {
      expect(screen.getAllByText(String(c.length)).length).toBeGreaterThan(0);
    }

    // Before selecting: the hint is shown; the distinctive trailing phrase (past
    // the snippet truncation) is NOT in the DOM yet (AC2).
    expect(screen.getByText(/select a chunk/i)).toBeTruthy();
    expect(screen.queryByText(/third chunk marker/)).toBeNull();

    // Clicking the third chunk's row reveals its full text (AC2).
    fireEvent.click(screen.getByText(/Small overlapping chunks preserve/));
    expect(screen.getByText(/third chunk marker/)).toBeTruthy();

    // Selecting another row swaps the full text (AC2).
    fireEvent.click(screen.getByText(/Cosine similarity ranks the stored/));
    expect(screen.getByText(/second chunk marker/)).toBeTruthy();
    expect(screen.queryByText(/third chunk marker/)).toBeNull();
  });

  it("shows the empty-state when no ingestion has happened", () => {
    seq = 0;
    seed([ev("agent.route", "end")]);
    render(<IngestionPipelinePanel onClose={vi.fn()} />);
    expect(screen.getByText(/upload a document/i)).toBeTruthy();
  });
});
