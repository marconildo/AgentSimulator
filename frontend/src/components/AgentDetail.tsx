import type { ReactNode } from "react";

import { useT } from "../i18n";
import { formatTokens, formatUsd } from "../lib/cost";
import type { DerivedView } from "../lib/derive";
import type { TraceEvent } from "../types/events";

// Focused drill-in for the Agent: the **anatomy** of an AI agent — its brain (the
// LLM, called on every reasoning round), its senses (the message), its memory
// (working + long-term + vector recall), its hands (tools) and its speech (the
// answer). Everything is composed from the captured trace + the projection's real
// token/cost totals (no extra requests), so it stays in sync with the cursor.

const BRAIN = "var(--color-orange)";

interface AgentDetailProps {
  view: DerivedView;
  onClose: () => void;
}

function lastEnd(events: TraceEvent[], stage: string): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].stage === stage && events[i].phase === "end") return events[i];
  }
  return undefined;
}

const tok = (s: string | undefined): number => Math.ceil((s?.length ?? 0) / 4);

export function AgentDetail({ view, onClose }: AgentDetailProps) {
  const t = useT();
  const a = t.agentDetail;

  const agentEv = view.stations.agent.events;
  const llmEv = view.stations.llm.events;
  const mcpEv = view.stations.mcp.events;
  const dbEv = view.stations.database.events;
  const ragEv = view.stations.rag.events;
  const usage = view.usage;

  const thinks = agentEv.filter((e) => e.stage === "agent.think" && e.phase === "end");
  const route = lastEnd(agentEv, "agent.route");
  const prompt = lastEnd(llmEv, "llm.prompt");
  const generate = lastEnd(llmEv, "llm.generate");
  const query = (route?.data.query as string | undefined) ?? "";
  const model =
    (generate?.data.model as string | undefined) ??
    (thinks.length ? (thinks[thinks.length - 1].data.model as string | undefined) : undefined) ??
    "";

  const toolCalls = mcpEv
    .filter((e) => e.stage === "mcp.call" && e.phase === "end")
    .map((e) => ({ tool: String(e.data.tool), args: e.data.args, result: String(e.data.result) }));

  const read = lastEnd(dbEv, "db.read");
  const historyPairs = (read?.data.recent as { message: string; answer: string }[] | undefined) ?? [];

  const retrieve = lastEnd(ragEv, "rag.retrieve");
  const chunks = (retrieve?.data.chunks as { source: string; score: number }[] | undefined) ?? [];

  const system = (prompt?.data.system as string | undefined) ?? "";
  const context = (prompt?.data.context as string | undefined) ?? "";
  const tools = (prompt?.data.tools as string[] | undefined) ?? [];
  const lastDecision = thinks.length ? String(thinks[thinks.length - 1].data.decision ?? "—") : "—";
  const toolResultsText = toolCalls.map((c) => `${c.tool} -> ${c.result}`).join("\n");
  const historyText = historyPairs.map((h) => `${h.message} / ${h.answer}`).join("\n");

  const started = agentEv.length > 0;
  const rounds = usage.rounds || thinks.length;
  const hasRealUsage = usage.totalTokens > 0;

  // Context-window parts with rough token estimates for a proportional bar. These
  // are an *approximation* of the mix (the real totals are in the Brain block).
  const parts = [
    { label: a.systemPrompt, tokens: tok(system), color: "var(--color-violet)" },
    { label: a.retrievedContext, tokens: tok(context), color: "var(--color-ok)" },
    { label: a.toolResults, tokens: tok(toolResultsText), color: "var(--color-warn)" },
    { label: a.history, tokens: tok(historyText), color: "var(--color-blue)" },
  ].filter((p) => p.tokens > 0);
  const totalTokens = parts.reduce((s, p) => s + p.tokens, 0) || 1;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[color-mix(in_srgb,var(--color-base)_94%,transparent)] backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-3">
        <button
          onClick={onClose}
          className="rounded-full border px-3 py-1 text-[12px] font-medium transition hover:bg-[var(--color-panel-2)]"
          style={{ borderColor: BRAIN, color: BRAIN }}
        >
          ← {a.back}
        </button>
        <span className="text-2xl">🧠</span>
        <div>
          <div className="text-[15px] font-semibold text-[var(--color-ink)]">{a.title}</div>
          <div className="text-[11px] text-[var(--color-muted)]">{a.subtitle}</div>
        </div>
      </div>

      {!started ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-[var(--color-muted)]">
          {a.waiting}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 lg:grid-cols-2">
          {/* Brain — the LLM, used on every reasoning round (the centerpiece). */}
          <Panel title={a.brain} accent={BRAIN} hint={a.brainHint}>
            <div className="mb-3 flex items-center gap-1.5 text-[11px]">
              <Step label={a.reason} color="var(--color-pink)" />
              <Arrow />
              <Step label={a.act} color="var(--color-warn)" />
              <Arrow />
              <Step label={a.observe} color="var(--color-ok)" />
              <span className="ml-1 text-[var(--color-muted)]">↺</span>
            </div>
            {model && <KV k={a.model} v={model} />}
            <KV k={a.rounds} v={String(rounds)} />
            <KV k={a.lastDecision} v={lastDecision} />
            {hasRealUsage && (
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 border-t border-[var(--color-line)] pt-1.5">
                <KV k={a.promptTokens} v={formatTokens(usage.promptTokens)} />
                <KV k={a.completionTokens} v={formatTokens(usage.completionTokens)} />
                <KV k={a.totalTokens} v={formatTokens(usage.totalTokens)} />
                <KV k={a.cost} v={formatUsd(usage.costUsd)} />
              </div>
            )}
            <div className="mt-2 space-y-1">
              {thinks.map((th, idx) => {
                const calls = (th.data.tool_calls as { name: string }[] | undefined) ?? [];
                return (
                  <div key={idx} className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px]">
                    <span className="font-mono text-[var(--color-muted)]">#{idx + 1}</span>{" "}
                    <span style={{ color: BRAIN }}>{String(th.data.decision)}</span>
                    {calls.length > 0 && (
                      <span className="text-[var(--color-muted)]"> → {calls.map((c) => c.name).join(", ")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Senses + hands — what it perceives this turn, and the tools it used. */}
          <Panel title={a.senses} accent="var(--color-warn)" hint={a.workingMemoryHint}>
            {query && (
              <Labeled label={a.userMessage}>
                <Mono>{query}</Mono>
              </Labeled>
            )}
            <Labeled label={a.hands}>
              {toolCalls.length === 0 ? (
                <p className="text-[11px] italic text-[var(--color-label)]">{a.noToolCalls}</p>
              ) : (
                <div className="space-y-1">
                  {toolCalls.map((c, idx) => (
                    <div key={idx} className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1">
                      <div className="font-mono text-[11px] text-[var(--color-ink)]">
                        {c.tool}({JSON.stringify(c.args)})
                      </div>
                      <div className="font-mono text-[11px] text-[var(--color-ok-soft)]">→ {c.result}</div>
                    </div>
                  ))}
                </div>
              )}
            </Labeled>
          </Panel>

          {/* Long-term memory — survives across requests. */}
          <Panel title={a.longTermMemory} accent="var(--color-blue)" hint={a.longTermMemoryHint}>
            <Labeled label={a.conversationHistory}>
              {historyPairs.length === 0 ? (
                <p className="text-[11px] italic text-[var(--color-label)]">{a.noHistory}</p>
              ) : (
                <div className="space-y-1">
                  {historyPairs.map((h, idx) => (
                    <div key={idx} className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px]">
                      <div className="text-[var(--color-text-soft)]">🧑 {h.message}</div>
                      <div className="text-[var(--color-muted)]">🤖 {truncate(h.answer, 80)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Labeled>
            <Labeled label={a.vectorMemory}>
              <div className="flex flex-wrap gap-1">
                {chunks.map((c, idx) => (
                  <span key={idx} className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-soft)]">
                    {c.source} · {c.score.toFixed(2)}
                  </span>
                ))}
              </div>
            </Labeled>
          </Panel>

          {/* Context window — what is actually assembled and sent to the brain. */}
          <Panel title={a.contextWindow} accent="var(--color-ok)" hint={a.contextWindowHint}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-label)]">
              {a.approxProportion}
            </div>
            <div className="mb-2 flex h-3 w-full overflow-hidden rounded-full border border-[var(--color-line)]">
              {parts.map((p) => (
                <div
                  key={p.label}
                  title={`${p.label} · ${a.approxTokens(p.tokens)}`}
                  style={{ width: `${(p.tokens / totalTokens) * 100}%`, background: p.color }}
                />
              ))}
            </div>
            <div className="space-y-1">
              {parts.map((p) => (
                <div key={p.label} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-[var(--color-text-soft)]">{p.label}</span>
                  </span>
                  <span className="font-mono text-[var(--color-muted)]">{a.approxTokens(p.tokens)}</span>
                </div>
              ))}
            </div>
            {tools.length > 0 && (
              <Labeled label={a.tools}>
                <div className="flex flex-wrap gap-1">
                  {tools.map((tl) => (
                    <span key={tl} className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-soft)]">
                      {tl}
                    </span>
                  ))}
                </div>
              </Labeled>
            )}
          </Panel>

          {/* Speech — what the agent says back. */}
          <div className="lg:col-span-2">
            <Panel title={a.speech} accent="var(--color-sky)">
              {view.answer ? (
                <Mono>{view.answer}</Mono>
              ) : (
                <p className="text-[11px] italic text-[var(--color-label)]">{a.noAnswerYet}</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

// --- small presentational helpers -------------------------------------------

function Panel({
  title,
  accent,
  hint,
  children,
}: {
  title: string;
  accent: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_75%,transparent)] p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
          {title}
        </span>
        {hint && <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Step({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 font-mono text-[10px]"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  );
}

function Arrow() {
  return <span className="text-[var(--color-muted)]">→</span>;
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5 text-[12px]">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className="font-mono text-[var(--color-ink)]">{v}</span>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-label)]">{label}</div>
      {children}
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-[var(--color-ink)]">
      {children}
    </p>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
