// 009-live-pacing — pace the *live* playhead so the journey through the stations
// is legible. The backend produces the structural stages in milliseconds and the
// SSE delivers them in a burst; without pacing the playhead snaps to the tail and
// the canvas teleports to the LLM, so only the (slow, real) token stream is ever
// visible. This pure reducer advances the cursor at most one *structural* event
// per `LIVE_STEP_MS`, while letting token events flush at the model's real arrival
// speed — it's a projection-over-time decision, never a server-side delay.

import type { TraceEvent } from "../types/events";

/** Minimum on-screen dwell for a structural stage change, in milliseconds. */
export const LIVE_STEP_MS = 120;

// 032-network-boundary — the final persist (db.write) lingers longer than a
// regular structural step so the learner actually notices the write before the
// run closes (otherwise it zips past into the run-finished backend END).
export const PERSIST_DWELL_MS = 600;

/**
 * Token (`llm.generate/progress`) events don't change the active station, so they
 * carry no dwell — they flush to the live tail and the answer types at the
 * model's real speed. Everything else is "structural" and gets the dwell.
 */
export function isFastForward(ev: TraceEvent): boolean {
  return ev.stage === "llm.generate" && ev.phase === "progress";
}

/** On-screen dwell before the playhead advances past `ev` (032-network-boundary). */
export function dwellFor(ev: TraceEvent): number {
  return ev.stage === "db.write" ? PERSIST_DWELL_MS : LIVE_STEP_MS;
}

export interface PaceResult {
  cursor: number;
  advancedAt: number;
}

/**
 * Decide where the live playhead should sit at `now`, given the current `cursor`
 * and the time of the last *paced* (structural) advance. Advances by at most one
 * structural event per `LIVE_STEP_MS`, flushing any run of token events for free.
 */
export function paceAdvance(
  events: TraceEvent[],
  cursor: number,
  lastAdvanceAt: number,
  now: number,
): PaceResult {
  const tail = events.length - 1;
  let c = cursor;
  let at = lastAdvanceAt;

  // Flush any token events already in front of the playhead — no dwell.
  while (c < tail && isFastForward(events[c + 1])) c++;

  // Advance past one structural event once its minimum dwell has elapsed, then
  // flush any token run that immediately follows it. The dwell is per-event so
  // the final persist (db.write) lingers longer than a regular step (032).
  const dwell = c >= 0 && events[c] ? dwellFor(events[c]) : LIVE_STEP_MS;
  if (c < tail && now - at >= dwell) {
    c++;
    at = now;
    while (c < tail && isFastForward(events[c + 1])) c++;
  }

  return { cursor: c, advancedAt: at };
}
