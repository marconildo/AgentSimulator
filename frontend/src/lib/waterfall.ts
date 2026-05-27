// 015-latency-waterfall — a pure projection of the event log into a
// Chrome-DevTools-style timing breakdown: one bar per timed *phase occurrence*
// (so a ReAct loop yields `reason` twice), in run order, plus a single
// reconciling `overhead` bar. Reads only existing event timing — no new
// `Stage`, no backend change, nothing re-measured.
//
// The honest timing model (spec AC3):
//   • Total = the run's wall-clock span (last event ts − first event ts).
//   • A segment's duration is the wall-clock footprint of its own events
//     (last ts − first ts within the occurrence). Using the span rather than
//     summing `latency_ms` avoids the nesting double-count: `agent.think` wraps
//     `llm.prompt` (both in the `reason` phase), so their latencies overlap —
//     the span counts that wall-clock window exactly once.
//   • The wrapping `backend` stage is excluded from the bars (it is the
//     envelope, ≈ the whole run; a bar for it would double-count the total, and
//     the trailing `backend/end` would otherwise spawn a spurious second
//     `request` bar).
//   • Reconciliation: overhead = max(0, total − Σ segment durations) → one
//     `overhead/transit` bar. Segments are disjoint wall-clock windows in time
//     order, so Σ ≤ total and the remainder is honest unattributed time (queue,
//     transit, the backend envelope). The max(0, …) floor is defensive.

import { STAGE_TO_PHASE, type TimelinePhase } from "./phases";
import { toMs } from "./time";
import type { TraceEvent } from "../types/events";

/** A bar's label: a timeline phase, or the reconciling remainder. */
export type WaterfallLabel = TimelinePhase | "overhead";

/** One occurrence of a phase (or the overhead remainder) on the waterfall. */
export interface WaterfallSegment {
  label: WaterfallLabel;
  /** ms from the run start to this segment's first event. */
  offsetMs: number;
  /** wall-clock footprint of this occurrence (≥ 0). */
  durationMs: number;
}

export interface Waterfall {
  segments: WaterfallSegment[];
  /** the run's wall-clock span (last ts − first ts). */
  totalMs: number;
}

// In-progress accumulator for one contiguous phase occurrence.
interface Run {
  label: TimelinePhase;
  firstTs: number;
  lastTs: number;
}

/**
 * Fold an event log into an ordered timing breakdown. Pure: never reads or
 * mutates anything but its argument.
 */
export function waterfallSegments(events: TraceEvent[]): Waterfall {
  if (events.length === 0) return { segments: [], totalMs: 0 };

  const runStart = toMs(events[0].ts);
  const runEnd = toMs(events[events.length - 1].ts);
  const totalMs = Math.max(0, runEnd - runStart);

  const segments: WaterfallSegment[] = [];
  let cur: Run | null = null;

  const flush = () => {
    if (!cur) return;
    segments.push({
      label: cur.label,
      offsetMs: cur.firstTs - runStart,
      durationMs: cur.lastTs - cur.firstTs,
    });
    cur = null;
  };

  for (const e of events) {
    if (e.stage === "backend") continue; // the envelope is not a bar
    const phase = STAGE_TO_PHASE[e.stage];
    if (!phase) continue; // defensive: an unmapped stage is skipped, not crashed
    const ts = toMs(e.ts);
    if (cur && cur.label === phase) {
      cur.lastTs = ts; // extend the current occurrence
    } else {
      flush(); // a new contiguous occurrence begins
      cur = { label: phase, firstTs: ts, lastTs: ts };
    }
  }
  flush();

  // Reconcile the unattributed remainder into a single overhead/transit bar.
  const attributed = segments.reduce((sum, s) => sum + s.durationMs, 0);
  const overhead = Math.max(0, totalMs - attributed);
  if (overhead > 0) {
    segments.push({ label: "overhead", offsetMs: attributed, durationMs: overhead });
  }

  return { segments, totalMs };
}
