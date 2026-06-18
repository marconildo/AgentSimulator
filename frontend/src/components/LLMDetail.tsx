import { useMemo, useState, type ReactNode } from "react";

import { useT } from "../i18n";
import { formatLatency } from "../lib/time";
import { formatTokens, formatTps, formatUsd } from "../lib/cost";
import { deriveLlmRounds, type GenerationCall, type ReasoningCall } from "../lib/llmRounds";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";

// 068-llm-rounds-history — focused drill-in for the LLM station ("open full view").
// A single turn makes several real model calls (one per ReAct reasoning round + the
// final generation); the Inspector only surfaces the last (it reads via `pick()`).
// This overlay lists EVERY call, each with its own full prompt, latency and tokens —
// a pure projection of the captured trace (no extra request), driven by the same
// cursor as the canvas so step/replay stays in sync. Sibling of AgentDetail.

const LLM = "var(--color-orange)";

interface LLMDetailProps {
  onClose: () => void;
}

export function LLMDetail({ onClose }: LLMDetailProps) {
  const t = useT();
  const l = t.llmDetail;
  const ins = t.inspector;

  // The same visible slice the canvas projects (events up to the cursor), so the
  // overlay and the canvas never diverge across live streaming / step / replay.
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );
  const calls = useMemo(() => deriveLlmRounds(visible), [visible]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[color-mix(in_srgb,var(--color-base)_94%,transparent)] backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-3">
        <button
          onClick={onClose}
          className="rounded-full border px-3 py-1 text-[12px] font-medium transition hover:bg-[var(--color-panel-2)]"
          style={{ borderColor: LLM, color: LLM }}
        >
          ← {l.back}
        </button>
        <span className="text-2xl">✨</span>
        <div>
          <div className="text-[15px] font-semibold text-[var(--color-ink)]">{l.title}</div>
          <div className="text-[11px] text-[var(--color-muted)]">{l.subtitle}</div>
        </div>
      </div>

      {calls.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-[var(--color-muted)]">
          {l.noCalls}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-4">
          {calls.map((call, idx) =>
            call.kind === "reasoning" ? (
              <ReasoningCard key={idx} call={call} l={l} ins={ins} />
            ) : (
              <GenerationCard key={idx} call={call} l={l} ins={ins} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

type L = ReturnType<typeof useT>["llmDetail"];
type Ins = ReturnType<typeof useT>["inspector"];

function ReasoningCard({ call, l, ins }: { call: ReasoningCall; l: L; ins: Ins }) {
  const [open, setOpen] = useState(false);
  const decisionLabel =
    call.decision === "answer" ? l.decisionAnswered : call.decision ? l.decisionCalledTools : null;
  return (
    <Card accent={LLM}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-[13px] font-semibold" style={{ color: LLM }}>
          {l.reasoningRound(call.round)}
        </span>
        {decisionLabel && <Pill>{decisionLabel}</Pill>}
        {call.toolCalls.map((tc, i) => (
          <Pill key={i}>{tc.name}</Pill>
        ))}
        <span className="ml-auto text-[15px] text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
        {typeof call.latencyMs === "number" && (
          <Stat k={l.latency} v={formatLatency(call.latencyMs)} />
        )}
        {typeof call.promptTokens === "number" && (
          <Stat k={ins.promptTokens} v={formatTokens(call.promptTokens)} />
        )}
        {typeof call.completionTokens === "number" && (
          <Stat k={ins.completionTokens} v={formatTokens(call.completionTokens)} />
        )}
        {typeof call.totalTokens === "number" && (
          <Stat k={ins.totalTokens} v={formatTokens(call.totalTokens)} />
        )}
        {typeof call.costUsd === "number" && <Stat k={ins.cost} v={formatUsd(call.costUsd)} />}
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
            {l.promptFor}
          </div>
          {call.preview.system && (
            <Labeled label={ins.system}>{call.preview.system}</Labeled>
          )}
          {Array.isArray(call.preview.history) && call.preview.history.length > 0 && (
            <Labeled label={ins.history}>
              {call.preview.history.map((h) => `▸ ${h.message}\n${h.answer}`).join("\n\n")}
            </Labeled>
          )}
          {call.preview.context && (
            <Labeled label={ins.retrievedContext}>{call.preview.context}</Labeled>
          )}
          {Array.isArray(call.preview.tools) && call.preview.tools.length > 0 && (
            <div>
              <Caption>{ins.tools}</Caption>
              <div className="flex flex-wrap gap-1">
                {call.preview.tools.map((tool) => (
                  <Pill key={tool}>{tool}</Pill>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(call.preview.messages) && call.preview.messages.length > 0 && (
            <Labeled label={ins.userMessage}>
              {call.preview.messages.map((m) => m.content).join("\n\n")}
            </Labeled>
          )}
          {/* The model's OUTPUT for this round — what it actually produced: the tool
              call(s) it emitted (name + arguments), or the decision to answer (whose
              text is the generation call shown below). Closes the input-only gap. */}
          <div className="border-t border-[var(--color-line)] pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LLM }}>
              {l.response}
            </div>
            {call.toolCalls.length > 0 ? (
              <div className="mt-1 space-y-2">
                {call.toolCalls.map((tc, i) => (
                  <Labeled key={i} label={`→ ${tc.name}(…)`}>
                    {JSON.stringify(tc.args ?? {}, null, 2)}
                  </Labeled>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[11.5px] text-[var(--color-muted)]">{l.decidedToAnswer}</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function GenerationCard({ call, l, ins }: { call: GenerationCall; l: L; ins: Ins }) {
  return (
    <Card accent={LLM}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold" style={{ color: LLM }}>
          {l.generation}
        </span>
        {call.model && <Pill>{call.model}</Pill>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
        {typeof call.latencyMs === "number" && (
          <Stat k={l.latency} v={formatLatency(call.latencyMs)} />
        )}
        {typeof call.ttftMs === "number" && <Stat k={ins.ttft} v={formatLatency(call.ttftMs)} />}
        {typeof call.tokensPerSec === "number" && (
          <Stat k={ins.throughput} v={formatTps(call.tokensPerSec)} />
        )}
        {typeof call.totalTokens === "number" && (
          <Stat k={ins.totalTokens} v={formatTokens(call.totalTokens)} />
        )}
        {typeof call.costUsd === "number" && <Stat k={ins.cost} v={formatUsd(call.costUsd)} />}
      </div>
      {call.answer !== undefined && (
        <div className="mt-3 border-t border-[var(--color-line)] pt-3">
          <Caption>{ins.generatedAnswer}</Caption>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-[var(--color-ink)]">
            {call.answer}
          </pre>
        </div>
      )}
    </Card>
  );
}

// --- small presentational helpers ------------------------------------------

function Card({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div
      className="rounded-xl border bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] p-3"
      style={{ borderColor: `color-mix(in srgb, ${accent} 30%, var(--color-line))` }}
    >
      {children}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
      {children}
    </span>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span>
      {k} <span className="font-semibold text-[var(--color-ink)]">{v}</span>
    </span>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Caption>{label}</Caption>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--color-base)] p-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink)]">
        {children}
      </pre>
    </div>
  );
}
