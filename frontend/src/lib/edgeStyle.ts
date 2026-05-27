// 032-network-boundary — the pure edge stroke-style decision, extracted from
// FlowEdge so the return-leg distinctness is unit-testable. An active *reverse*
// leg (an internal `respond` hop walking agent→backend→frontend) reads as a
// return — dashed, in the stream color — not just a moving packet. The SSE
// response stream keeps its existing dashed-magenta look.

export const EDGE_STREAM_COLOR = "var(--color-sky-soft)";
export const EDGE_LINE_COLOR = "var(--color-line)";

export interface EdgeStroke {
  color: string;
  dashed: boolean;
  isReturn: boolean; // reads as a return leg (vs an outbound request)
}

/** Decide the stroke for an edge given its live flags + the target accent. */
export function returnStyleFor(
  active: boolean,
  reverse: boolean,
  stream: boolean,
  accent: string,
): EdgeStroke {
  // The SSE response stream (frontend↔backend) — the existing dashed-magenta look.
  if (stream) return { color: EDGE_STREAM_COLOR, dashed: true, isReturn: true };
  // An active internal return leg (the respond walk back to the client).
  if (active && reverse) return { color: EDGE_STREAM_COLOR, dashed: true, isReturn: true };
  // An active outbound request — the target's accent, solid.
  if (active) return { color: accent, dashed: false, isReturn: false };
  // A quiet edge.
  return { color: EDGE_LINE_COLOR, dashed: false, isReturn: false };
}
