// 022-message-trace-link (T1) — the memoized trace loader over the existing
// GET /api/trace/{id} (fetchTrace). First select fetches; subsequent reads for
// the same trace_id hit the cache (traces are immutable once finished). A 404 /
// eviction resolves to an explicit `expired` result rather than a throw every
// caller must guard — the shared mechanism 018/020 reuse.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sse", () => ({ fetchTrace: vi.fn() }));

import * as sse from "./sse";
import { clearTraceCache, loadTrace } from "./traceCache";
import type { TraceSummary } from "../types/events";

const summary = (id: string): TraceSummary => ({
  trace_id: id,
  message: "hi",
  answer: "yo",
  events: [
    { trace_id: id, seq: 0, ts: 0, stage: "backend", phase: "end", label: "", data: {}, metrics: {} },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  clearTraceCache();
});

describe("traceCache.loadTrace (022)", () => {
  it("fetches once, then serves subsequent reads from the cache", async () => {
    vi.mocked(sse.fetchTrace).mockResolvedValue(summary("a"));

    const first = await loadTrace("a");
    const second = await loadTrace("a");

    expect(first).toEqual({ ok: true, events: summary("a").events });
    expect(second).toEqual(first);
    expect(sse.fetchTrace).toHaveBeenCalledTimes(1);
  });

  it("resolves a 404 / eviction to an `expired` result without throwing", async () => {
    vi.mocked(sse.fetchTrace).mockRejectedValue(new Error("trace not found"));

    const result = await loadTrace("gone");

    expect(result).toEqual({ ok: false, expired: true });
  });

  it("memoizes distinct trace ids independently", async () => {
    vi.mocked(sse.fetchTrace).mockImplementation(async (id: string) => summary(id));

    await loadTrace("a");
    await loadTrace("b");
    await loadTrace("a");

    expect(sse.fetchTrace).toHaveBeenCalledTimes(2);
  });
});
