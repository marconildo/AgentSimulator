/** @vitest-environment jsdom */
// 076-station-full-views — the Frontend "open full view" shows what the browser
// exchanged: the POSTed message + request overrides, and the streamed answer.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FrontendDetail } from "./FrontendDetail";
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

describe("FrontendDetail", () => {
  it("renders the sent message, the request body and the received answer", () => {
    seq = 0;
    seed([
      ev("frontend", "end", {
        message: "hello agent",
        session_id: "sess-1",
        request: { message: "hello agent", top_k: 4 },
      }),
      ev("respond", "end", { answer: "hello human" }),
    ]);
    render(<FrontendDetail onClose={vi.fn()} />);
    expect(screen.getByText("hello agent")).toBeTruthy();
    // request body JSON
    expect(screen.getByText(/"top_k": 4/)).toBeTruthy();
    // streamed answer
    expect(screen.getByText("hello human")).toBeTruthy();
  });

  it("shows the empty-state when nothing has been sent yet", () => {
    seed([ev("agent.route", "end", { query: "hi" })]);
    render(<FrontendDetail onClose={vi.fn()} />);
    expect(screen.getByText(/Nothing sent/i)).toBeTruthy();
  });
});
