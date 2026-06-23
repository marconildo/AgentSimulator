// 092-network-appliance-real-io — selectInboundRequest reads the real request that
// entered the chain from the `frontend` END event (pure projection, cursor-bounded).
import { describe, expect, it } from "vitest";

import { selectInboundRequest } from "./stationDetail";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

describe("selectInboundRequest (092)", () => {
  it("returns the message + request body from the frontend END event", () => {
    seq = 0;
    const req = { message: "hi", session_id: "s", top_k: 4, mode: "stream", model: "gpt-4.1-mini" };
    const got = selectInboundRequest([ev("frontend", "end", { message: "hi", request: req })]);
    expect(got?.message).toBe("hi");
    expect(got?.requestBody?.model).toBe("gpt-4.1-mini");
  });

  it("is undefined when no frontend event is present (honest empty)", () => {
    seq = 0;
    expect(selectInboundRequest([ev("agent.route", "end", { query: "hi" })])).toBeUndefined();
    expect(selectInboundRequest([])).toBeUndefined();
  });
});
