/** @vitest-environment jsdom */
// 076-station-full-views — the MCP "open full view" lists the tool discovery and
// EVERY tool call of the turn (name/args/result + JSON-RPC frames), plus the
// DeepAgents local tool calls. Pure projection of the captured trace, driven by
// the same simulator cursor as the canvas.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { McpDetail } from "./McpDetail";
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

describe("McpDetail", () => {
  it("renders discovery and every tool call with its JSON-RPC frames", () => {
    seq = 0;
    seed([
      ev("mcp.discover", "end", {
        transport: "mcp-stdio",
        tools: [{ name: "calculator", description: "do math" }],
      }),
      ev("mcp.call", "end", {
        tool: "calculator",
        args: { expression: "2+2" },
        result: "4",
        jsonrpc: { request: { method: "tools/call" }, response: { result: "4" } },
      }),
      ev("mcp.call", "end", {
        tool: "current_time",
        args: {},
        result: "12:00",
      }),
    ]);
    render(<McpDetail onClose={vi.fn()} />);
    // Discovery — "calculator" also appears as the call's tool value, hence getAll.
    expect(screen.getAllByText("calculator").length).toBeGreaterThan(0);
    expect(screen.getByText("mcp-stdio")).toBeTruthy();
    // Both calls present (not just the last)
    expect(screen.getByText("Tool call 1")).toBeTruthy();
    expect(screen.getByText("Tool call 2")).toBeTruthy();
    // Raw JSON-RPC frame rendered
    expect(screen.getByText(/tools\/call/)).toBeTruthy();
  });

  it("surfaces DeepAgents local tool calls (no mcp.call)", () => {
    seq = 0;
    seed([
      ev("agent.think", "end", {
        decision: "call_tools",
        tool_calls: [{ name: "write_todos", args: { todos: ["plan"] } }],
      }),
    ]);
    render(<McpDetail onClose={vi.fn()} />);
    expect(screen.getByText("write_todos")).toBeTruthy();
  });

  it("shows the empty-state when no tool activity has run yet", () => {
    seed([ev("agent.route", "end", { query: "hi" })]);
    render(<McpDetail onClose={vi.fn()} />);
    expect(screen.getByText(/No tool activity/i)).toBeTruthy();
  });
});
