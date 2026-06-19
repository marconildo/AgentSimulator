/** @vitest-environment jsdom */
// 076-station-full-views — the App Database "open full view" shows BOTH SQL ops
// of the turn (db.read load-history + db.write persist) with their real payloads.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseDetail } from "./DatabaseDetail";
import { useSimulator } from "../store/useSimulator";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function seed(events: TraceEvent[]): void {
  useSimulator.setState({ events, cursor: events.length - 1 });
}

afterEach(() => {
  cleanup();
  useSimulator.setState({ events: [], cursor: -1 });
});

describe("DatabaseDetail", () => {
  it("renders both the read and the write operation with payloads", () => {
    seq = 0;
    seed([
      ev("db.read", "end", {
        table: "messages",
        session_id: "sess-1",
        total_rows: 2,
        recent: [{ message: "earlier question", answer: "earlier answer" }],
      }),
      ev("db.write", "end", {
        table: "messages",
        operation: "INSERT",
        row_id: "msg-42",
        session_id: "sess-1",
        total_rows: 3,
      }),
    ]);
    render(<DatabaseDetail onClose={vi.fn()} />);
    // read
    expect(screen.getByText(/Recent history/i)).toBeTruthy();
    expect(screen.getByText(/earlier question/)).toBeTruthy();
    // write
    expect(screen.getByText(/persisted/i)).toBeTruthy();
    expect(screen.getByText("msg-42")).toBeTruthy();
  });

  it("shows the empty-state when no database activity has run yet", () => {
    seed([ev("agent.route", "end", { query: "hi" })]);
    render(<DatabaseDetail onClose={vi.fn()} />);
    expect(screen.getByText(/No database activity/i)).toBeTruthy();
  });

  // 079-db-query-detail — the real SQL statements of the turn, per operation.
  it("renders each executed SQL statement with its rows-affected readout", () => {
    seq = 0;
    seed([
      ev("db.read", "end", {
        session_id: "sess-1",
        total_rows: 0,
        recent: [],
        queries: [
          { operation: "SELECT", sql: "SELECT COUNT(*) AS n FROM messages WHERE session_id = 'sess-1'", rows: 0 },
          {
            operation: "SELECT",
            sql: "SELECT message, answer FROM messages WHERE session_id = 'sess-1' ORDER BY created_at DESC LIMIT 5",
            rows: 0,
          },
        ],
      }),
      ev("db.write", "end", {
        operation: "INSERT",
        row_id: "msg-42",
        session_id: "sess-1",
        total_rows: 1,
        queries: [
          {
            operation: "INSERT",
            sql: "INSERT INTO messages (id, session_id, message, answer, chunks, skills, created_at) VALUES ('msg-42', 'sess-1', 'what time is it?', '14h', '[]', '[]', 1.0)",
            rows: 1,
          },
          { operation: "UPDATE", sql: "UPDATE sessions SET updated_at = 1.0, title = 'what time is it?' WHERE id = 'sess-1'", rows: 1 },
        ],
      }),
    ]);
    render(<DatabaseDetail onClose={vi.fn()} />);
    expect(screen.getByText(/SELECT COUNT\(\*\)/)).toBeTruthy();
    expect(screen.getByText(/INSERT INTO messages/)).toBeTruthy();
    expect(screen.getAllByText(/what time is it\?/).length).toBeGreaterThan(0);
    expect(screen.getByText(/UPDATE sessions/)).toBeTruthy();
    // rows-affected readout present (multiple statements)
    expect(screen.getAllByText(/→ \d+ rows/).length).toBeGreaterThan(0);
  });

  it("degrades to the summary-only view when an older trace omits queries", () => {
    seq = 0;
    seed([
      ev("db.write", "end", {
        operation: "INSERT",
        row_id: "msg-7",
        session_id: "sess-1",
        total_rows: 1,
      }),
    ]);
    render(<DatabaseDetail onClose={vi.fn()} />);
    expect(screen.getByText("msg-7")).toBeTruthy();
    expect(screen.queryByText(/Statements executed/i)).toBeNull();
  });
});
