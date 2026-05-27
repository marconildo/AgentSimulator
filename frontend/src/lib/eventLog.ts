// 030-event-console — a pure projection of the trace into console rows, plus the
// copy/export value builders. Like deriveView it reads "events + cursor", so the
// console and the canvas stay in lock-step and live streaming and replay are the
// exact same code path. No backend, no protocol change — it only *reads* the model.

import type { StationId } from "./stations";
import { STAGE_TO_STATION } from "./stations";
import { toMs } from "./time";
import type { TraceEvent } from "../types/events";

export interface ConsoleRow {
  seq: number;
  index: number; // position in the events array (compared against the cursor)
  relMs: number; // ts − first event's ts, in milliseconds
  stage: string;
  phase: string;
  label: string;
  station: StationId; // owning station via STAGE_TO_STATION
  current: boolean; // index === cursor (never past the cursor — rows are sliced)
  sizeBytes: number; // byte length of the serialized event `data` ("how much moved")
  latencyMs?: number; // END events: metrics.latency_ms
  // A cross-station hop (the previous event belonged to a different station):
  // the leg this event represents, from → to.
  from?: StationId;
  to?: StationId;
}

/** Byte length of a UTF-8 string (a payload-size proxy for "how much moved"). */
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Project the event log (up to `cursor`) into console rows. Shows events up to
 * the playhead (live/step); at the tail (cursor = last) it shows them all. The
 * row at `index === cursor` is marked `current`; nothing past the cursor appears.
 */
export function eventLog(events: TraceEvent[], cursor: number): ConsoleRow[] {
  if (cursor < 0 || events.length === 0) return [];
  const t0 = toMs(events[0].ts);
  const upto = Math.min(cursor, events.length - 1);
  const rows: ConsoleRow[] = [];
  for (let i = 0; i <= upto; i++) {
    const ev = events[i];
    const station = STAGE_TO_STATION[ev.stage];
    const prevStation = i > 0 ? STAGE_TO_STATION[events[i - 1].stage] : undefined;
    const crossed = prevStation !== undefined && prevStation !== station;
    rows.push({
      seq: ev.seq,
      index: i,
      relMs: toMs(ev.ts) - t0,
      stage: ev.stage,
      phase: ev.phase,
      label: ev.label,
      station,
      current: i === cursor,
      sizeBytes: byteLength(JSON.stringify(ev.data ?? {})),
      latencyMs: ev.phase === "end" && typeof ev.metrics.latency_ms === "number"
        ? ev.metrics.latency_ms
        : undefined,
      from: crossed ? prevStation : undefined,
      to: crossed ? station : undefined,
    });
  }
  return rows;
}

/** "+0.158s" — a relative timestamp for a console row. */
export function formatRel(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}s`;
}

// --- Copy / export value builders (handed to the clipboard seam) -------------

/** Pretty-printed JSON for a single event. */
export const eventJson = (ev: TraceEvent): string => JSON.stringify(ev, null, 2);

/** Pretty-printed JSON for the whole trace (the array of events). */
export const traceJson = (events: TraceEvent[]): string => JSON.stringify(events, null, 2);

/** The run's request (trace) id, or "" when there are no events. */
export const traceId = (events: TraceEvent[]): string => events[0]?.trace_id ?? "";
