// 068-llm-rounds-history — project EVERY LLM call of a turn from the trace.
//
// A single chat turn makes several real model calls: one per `think` reasoning round
// of the ReAct loop (each an `agent.think` span wrapping an `llm.prompt` span) plus the
// final `llm.generate`. The Inspector only shows the *last* of each (it reads via
// `pick()`), so rounds 1…N−1 are invisible. This pure helper walks the event log and
// returns one entry per call so the LLM drill-in can show each round's full prompt,
// latency and tokens. Like `deriveView`, it is a pure projection of the visible event
// slice — live streaming and step/replay share this code path.

import type { PromptPreview, TraceEvent } from "../types/events";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

// One reasoning round: the model deciding whether to call a tool or answer. The prompt
// preview + latency come from the round's own `llm.prompt` END; the token usage / cost /
// decision come from its paired `agent.think` END (where 011-token-cost records them).
export interface ReasoningCall {
  kind: "reasoning";
  round: number; // 1-based reasoning-round index
  preview: PromptPreview;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  decision?: string; // "call_tools" | "answer" | "error"
  toolCalls: ToolCall[];
  model?: string;
}

// The final answer-generation call (`llm.generate`), with its streaming metrics.
export interface GenerationCall {
  kind: "generation";
  answer?: string;
  model?: string;
  latencyMs?: number;
  ttftMs?: number;
  tokensPerSec?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export type LlmCall = ReasoningCall | GenerationCall;

const num = (m: Record<string, number>, k: string): number | undefined => {
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

const str = (d: Record<string, unknown>, k: string): string | undefined => {
  const v = d[k];
  return typeof v === "string" ? v : undefined;
};

/**
 * Build the ordered list of LLM calls for a turn from its event log (the visible slice
 * up to the cursor). Reasoning rounds come first (in order), the generation last; a
 * partial log yields only the calls whose END has been reached.
 */
export function deriveLlmRounds(events: TraceEvent[]): LlmCall[] {
  const calls: LlmCall[] = [];

  const thinkEnds = events.filter((e) => e.stage === "agent.think" && e.phase === "end");
  const promptEnds = events.filter((e) => e.stage === "llm.prompt" && e.phase === "end");

  // Pair each think END with the last `llm.prompt` END that closed *within* that round
  // (between the previous think END and this one). Robust to the `llm_timeout` failure
  // mode, where one think wraps several attempt spans — we keep the last as the prompt.
  let prevSeq = -Infinity;
  thinkEnds.forEach((think, i) => {
    const within = promptEnds.filter((p) => p.seq > prevSeq && p.seq < think.seq);
    const prompt = within.length ? within[within.length - 1] : undefined;
    calls.push({
      kind: "reasoning",
      round: i + 1,
      preview: (prompt?.data ?? {}) as PromptPreview,
      latencyMs: prompt ? num(prompt.metrics, "latency_ms") : undefined,
      promptTokens: num(think.metrics, "prompt_tokens"),
      completionTokens: num(think.metrics, "completion_tokens"),
      totalTokens: num(think.metrics, "total_tokens"),
      costUsd: num(think.metrics, "cost_usd"),
      decision: str(think.data, "decision"),
      toolCalls: Array.isArray(think.data.tool_calls)
        ? (think.data.tool_calls as ToolCall[])
        : [],
      model: str(think.data, "model"),
    });
    prevSeq = think.seq;
  });

  const gen = [...events].reverse().find((e) => e.stage === "llm.generate" && e.phase === "end");
  if (gen) {
    calls.push({
      kind: "generation",
      answer: str(gen.data, "answer"),
      model: str(gen.data, "model"),
      latencyMs: num(gen.metrics, "latency_ms"),
      ttftMs: num(gen.metrics, "ttft_ms"),
      tokensPerSec: num(gen.metrics, "tokens_per_sec"),
      promptTokens: num(gen.metrics, "prompt_tokens"),
      completionTokens: num(gen.metrics, "completion_tokens"),
      totalTokens: num(gen.metrics, "total_tokens"),
      costUsd: num(gen.metrics, "cost_usd"),
    });
  }

  return calls;
}
