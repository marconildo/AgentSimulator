// Pure projection of the event log into what the canvas renders. Driving the
// view from "events up to a cursor" makes live streaming and step/replay the
// exact same code path — replay is just a smaller cursor.

import type { TraceEvent } from "../types/events";
import type { StationId } from "./stations";
import { HOPS, STAGE_TO_STATION, STATIONS } from "./stations";

export type StationStatus = "idle" | "active" | "done";

export interface StationRuntime {
  status: StationStatus;
  events: TraceEvent[];
  latencyMs?: number;
}

export interface DerivedView {
  stations: Record<StationId, StationRuntime>;
  activeStation: StationId | null;
  // The hop currently animating, and whether the packet travels target→source.
  activeHopId: string | null;
  hopReverse: boolean;
  // The SSE response streaming back to the client (frontend↔backend edge).
  streaming: boolean;
  answer: string;
  iterations: number; // agent reasoning turns so far
}

function hopId(source: StationId, target: StationId): string {
  return `${source}-${target}`;
}

export function deriveView(events: TraceEvent[], upto: number): DerivedView {
  const stations = {} as Record<StationId, StationRuntime>;
  for (const s of STATIONS) stations[s.id] = { status: "idle", events: [] };

  const visible = upto >= 0 ? events.slice(0, upto + 1) : [];
  const distinct: StationId[] = [];
  const tokens: string[] = [];
  let respondAnswer = "";
  let iterations = 0;

  for (const ev of visible) {
    const stationId = STAGE_TO_STATION[ev.stage];
    const runtime = stations[stationId];
    runtime.events.push(ev);

    if (ev.phase === "start") runtime.status = "active";
    else if (ev.phase === "end") {
      runtime.status = "done";
      if (typeof ev.metrics.latency_ms === "number") runtime.latencyMs = ev.metrics.latency_ms;
    }

    if (distinct[distinct.length - 1] !== stationId) distinct.push(stationId);

    if (ev.stage === "agent.think" && ev.phase === "end") iterations += 1;
    if (ev.stage === "llm.generate" && ev.phase === "progress" && typeof ev.data.token === "string") {
      tokens.push(ev.data.token);
    }
    if (ev.stage === "respond" && ev.phase === "end" && typeof ev.data.answer === "string") {
      respondAnswer = ev.data.answer;
    }
  }

  const last = visible[visible.length - 1];
  const finished = Boolean(last && last.stage === "respond" && last.phase === "end");

  let activeStation: StationId | null = distinct[distinct.length - 1] ?? null;
  const prevStation: StationId | null = distinct[distinct.length - 2] ?? null;
  if (finished) activeStation = null;

  // The response streams back over the SSE connection while the model is
  // generating tokens or the answer is being returned.
  const streaming = Boolean(last && (last.stage === "llm.generate" || last.stage === "respond")) && !finished;

  // Active hop: the edge connecting the previous and current station. The
  // packet always visually travels prev → active; `hopReverse` is true when
  // that means going against the edge's declared source→target direction (this
  // is what makes the agent loop animate back and forth on the same edge).
  let activeHopId: string | null = null;
  let hopReverse = false;
  if (activeStation && prevStation && activeStation !== prevStation) {
    const hop = HOPS.find(
      (h) =>
        (h.source === prevStation && h.target === activeStation) ||
        (h.source === activeStation && h.target === prevStation),
    );
    if (hop) {
      activeHopId = hopId(hop.source, hop.target);
      hopReverse = hop.source === activeStation; // edge points active→prev ⇒ packet runs reverse
    }
  }

  return {
    stations,
    activeStation,
    activeHopId,
    hopReverse,
    streaming,
    answer: tokens.length ? tokens.join("") : respondAnswer,
    iterations,
  };
}
