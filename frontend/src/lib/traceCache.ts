// 022-message-trace-link: a memoized loader over the existing GET /api/trace/{id}
// (`fetchTrace`). The first select for a `trace_id` fetches; subsequent reads hit
// the in-memory cache — traces are immutable once finished, so memoizing by id is
// safe, and it avoids refetch storms when 018/020 re-derive a long conversation
// turn by turn. A 404 / eviction resolves to an explicit `expired` result rather
// than a throw every caller must guard. In-memory only (resets on reload, §8).

import { fetchTrace } from "./sse";
import type { TraceEvent } from "../types/events";

export type TraceLoad = { ok: true; events: TraceEvent[] } | { ok: false; expired: true };

const cache = new Map<string, Promise<TraceLoad>>();

/** Load a finished turn's trace by `trace_id`, memoized; `expired` on a 404. */
export function loadTrace(traceId: string): Promise<TraceLoad> {
  const cached = cache.get(traceId);
  if (cached) return cached;
  // Cache the promise (not just the value) so concurrent loads share one fetch.
  // An evicted trace stays evicted within a session, so caching `expired` is
  // correct and keeps re-derivation from refetching a gone trace each recompute.
  const pending = fetchTrace(traceId)
    .then((summary): TraceLoad => ({ ok: true, events: summary.events }))
    .catch((): TraceLoad => ({ ok: false, expired: true }));
  cache.set(traceId, pending);
  return pending;
}

/** Test/teardown helper — the cache is module-global, reset between tests. */
export function clearTraceCache(): void {
  cache.clear();
}
