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
//
// 050-replay-bubble-streaming — `replayBubble` extends the same projection to a
// PERSISTED message whose trace is currently loaded on the canvas: when the
// simulator is mid-replay (cursor not at the tail), the loaded turn's bubble
// runs through the same status → streaming-answer states the live bubble shows;
// when the cursor settles at the tail (or there are no events to project from),
// the bubble returns to the persisted answer, byte-for-byte. Same engine, two
// cursors.

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
 * 050-replay-bubble-streaming — what the bubble of a PERSISTED, loaded turn
 * should render at a given cursor. Two states:
 *
 * - **Settled / no events.** Either the simulator has drained to the tail of a
 *   finished run (`isSettled`) or there is nothing to project from
 *   (`!hasEvents` — empty trace, expired trace). Returns the persisted answer
 *   VERBATIM (`streaming: false`) so the on-screen text is byte-for-byte
 *   identical to today's "after the run" frame. Avoids any drift between the
 *   reassembled-token text and what was persisted to the DB.
 * - **Mid-replay.** Delegates to `pendingBubble(view, phase)` — the same
 *   projection the live bubble uses, so step/replay teaches the exact "status
 *   → streamed answer + caret" experience a live send does (`agent.think`
 *   shows "Reasoning…", `llm.generate` progress streams tokens with a caret).
 */
export function replayBubble(
  view: DerivedView,
  phase: TimelinePhase | null,
  opts: { hasEvents: boolean; isSettled: boolean; persistedAnswer: string },
): PendingBubble {
  if (opts.isSettled || !opts.hasEvents) {
    return { kind: "answer", text: opts.persistedAnswer, streaming: false };
  }
  return pendingBubble(view, phase);
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
  // A cancelled run is terminal: settle immediately so any flow-settled waiter
  // releases instead of hanging on a playhead that will never reach the tail
  // (016-cancel-stream).
  if (s.status === "cancelled") return true;
  if (s.events.length === 0) return false;
  if (s.status === "streaming") return false;
  if (s.playing) return false;
  return s.cursor >= s.events.length - 1;
}
