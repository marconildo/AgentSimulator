import { useMemo, type ReactNode } from "react";

import { useT } from "../i18n";
import { formatLatency } from "../lib/time";
import { selectBackendFlow, type BackendFlow } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { Caption, DetailShell, KeyVal, Mono, Scroll } from "./DetailShell";

// 077-backend-lifecycle-flow — Backend "open full view" as an orchestration
// flowchart. The Backend is the conductor of the turn: it receives the payload,
// reads history, invokes the AI agent (RAG → MCP → LLM), persists the result and
// streams the answer back. This overlay draws that sequence top-to-bottom, each
// step carrying its real trace data + latency. The agent step is a SUMMARY that
// points at the Agent/LLM/MCP full views — it does not re-render them. Pure
// projection of the captured trace (same cursor as the canvas; step/replay safe).

const BACKEND = "var(--color-violet)";

export function BackendDetail({ onClose }: { onClose: () => void }) {
  const t = useT();
  const d = t.backendDetail;

  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );
  const flow = useMemo(() => selectBackendFlow(visible), [visible]);

  const steps = buildSteps(flow, d);

  return (
    <DetailShell
      accent={BACKEND}
      icon="⚙️"
      title={d.title}
      subtitle={d.subtitle}
      back={d.back}
      onClose={onClose}
      empty={!flow.started}
      emptyText={d.empty}
    >
      <p className="mb-1 text-[12px] text-[var(--color-muted)]">{d.intro}</p>
      <div className="flex flex-col items-stretch">
        {steps.map((step, idx) => (
          <div key={step.key}>
            {/* The hop leading INTO this step — the labelled connector. */}
            <Connector label={step.hop} first={idx === 0} />
            <FlowStep step={step} d={d} />
          </div>
        ))}
      </div>
    </DetailShell>
  );
}

// --- step model -------------------------------------------------------------

type D = ReturnType<typeof useT>["backendDetail"];

interface Step {
  key: string;
  icon: string;
  title: string;
  hop: string;
  latencyMs?: number;
  done: boolean;
  body: ReactNode;
}

function buildSteps(flow: BackendFlow, d: D): Step[] {
  return [
    {
      key: "receive",
      icon: "📥",
      title: d.stepReceive,
      hop: d.hopReceive,
      done: flow.receive !== undefined,
      body: flow.receive && (
        <>
          <KeyVal k="POST" v="/api/chat" />
          {flow.receive.message !== undefined && (
            <>
              <Caption>{d.message}</Caption>
              <Mono>{flow.receive.message}</Mono>
            </>
          )}
          {flow.receive.request && <Scroll>{JSON.stringify(flow.receive.request, null, 2)}</Scroll>}
        </>
      ),
    },
    {
      key: "history",
      icon: "🗄️",
      title: d.stepHistory,
      hop: d.hopRead,
      latencyMs: flow.history?.latencyMs,
      done: flow.history !== undefined,
      body: flow.history && (
        <>
          <KeyVal k="SELECT" v={flow.history.table} />
          <KeyVal k={d.rowsLoaded} v={String(flow.history.rowsLoaded)} />
        </>
      ),
    },
    {
      key: "agent",
      icon: "🤖",
      title: d.stepAgent,
      hop: d.hopInvoke,
      done: flow.agent !== undefined,
      body: flow.agent && (
        <>
          <KeyVal k={d.reasoningRounds} v={String(flow.agent.reasoningRounds)} />
          <KeyVal k={d.retrievals} v={String(flow.agent.retrievals)} />
          {flow.agent.toolCalls.length > 0 && (
            <>
              <Caption>{d.toolCalls}</Caption>
              <div className="flex flex-wrap gap-1">
                {flow.agent.toolCalls.map((name, i) => (
                  <span
                    key={i}
                    className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-muted)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
          <p className="mt-2 text-[11px] italic text-[var(--color-label)]">{d.agentHint}</p>
        </>
      ),
    },
    {
      key: "persist",
      icon: "💾",
      title: d.stepPersist,
      hop: d.hopWrite,
      latencyMs: flow.persist?.latencyMs,
      done: flow.persist !== undefined,
      body: flow.persist && (
        <>
          <KeyVal k={flow.persist.operation} v="messages" />
          <KeyVal k="row_id" v={flow.persist.rowId} />
          <KeyVal k="total_rows" v={String(flow.persist.totalRows)} />
        </>
      ),
    },
    {
      key: "respond",
      icon: "📤",
      title: d.stepRespond,
      hop: d.hopRespond,
      latencyMs: flow.respond?.latencyMs,
      done: flow.respond !== undefined,
      body: flow.respond && (
        <>
          {flow.respond.delivery && <KeyVal k={d.delivery} v={flow.respond.delivery} />}
          {flow.respond.sessionId && <KeyVal k={d.session} v={flow.respond.sessionId} />}
          {flow.respond.answer !== undefined && (
            <>
              <Caption>{d.answer}</Caption>
              <Mono>{flow.respond.answer}</Mono>
            </>
          )}
        </>
      ),
    },
  ];
}

// --- presentational ---------------------------------------------------------

function Connector({ label, first }: { label: string; first: boolean }) {
  return (
    <div className="flex flex-col items-center">
      {!first && <div className="h-3 w-px bg-[var(--color-line)]" />}
      <span className="my-0.5 rounded-full border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-px text-[9.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </span>
      <div className="h-3 w-px bg-[var(--color-line)]" />
      <span className="-mt-1 text-[10px] text-[var(--color-faint)]">▼</span>
    </div>
  );
}

function FlowStep({ step, d }: { step: Step; d: D }) {
  return (
    <div
      className="rounded-xl border bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] p-3"
      style={{
        borderColor: step.done
          ? `color-mix(in srgb, ${BACKEND} 30%, var(--color-line))`
          : "var(--color-line)",
        opacity: step.done ? 1 : 0.55,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[16px]">{step.icon}</span>
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">{step.title}</span>
        {typeof step.latencyMs === "number" && (
          <span className="ml-auto text-[11px] text-[var(--color-muted)]">
            {d.latency} <span className="font-semibold">{formatLatency(step.latencyMs)}</span>
          </span>
        )}
      </div>
      <div className="mt-2">
        {step.done ? (
          step.body
        ) : (
          <p className="text-[11px] italic text-[var(--color-faint)]">{d.pending}</p>
        )}
      </div>
    </div>
  );
}
