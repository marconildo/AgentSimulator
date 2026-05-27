// 012-chat-flow-sync — pure projections that keep the chat bubble in lockstep with
// the *paced* playhead (009), so the answer never appears ahead of the flow.
//
// `pendingBubble` decides what the in-flight chat bubble shows: a live execution
// status (the current timeline phase) while the derived answer is still empty,
// then the answer itself (typed word-by-word in stream, whole in batch — both
// fall out of driving it from the cursor, no mode branching here).
//
// `isFlowSettled` is the gate `useChat` uses to hold the persisted message until
// the playhead has drained to the end of a finished run.

import type { DerivedView } from "./derive";
import type { TimelinePhase } from "./phases";

export type PendingBubble =
  | { kind: "status"; phase: TimelinePhase | null }
  | { kind: "answer"; text: string; streaming: boolean };

/**
 * What the live (pending) chat bubble should render, given the paced derived
 * `view` and the timeline `phase` at the same cursor. While the answer is empty
 * the bubble names the current stage; once the answer exists it shows the answer.
 */
export function pendingBubble(view: DerivedView, phase: TimelinePhase | null): PendingBubble {
  if (view.answer) return { kind: "answer", text: view.answer, streaming: view.streaming };
  return { kind: "status", phase };
}

/**
 * The paced playhead has drained to the end of a finished run — safe to swap the
 * live bubble for the persisted message without jumping ahead of the flow.
 * True only when the run is over (not streaming), no replay is animating, and the
 * cursor has reached the tail of a non-empty event log.
 */
export function isFlowSettled(s: {
  events: readonly unknown[];
  cursor: number;
  status: string;
  playing: boolean;
}): boolean {
  if (s.events.length === 0) return false;
  if (s.status === "streaming") return false;
  if (s.playing) return false;
  return s.cursor >= s.events.length - 1;
}
