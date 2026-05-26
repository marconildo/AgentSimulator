import type { ReactNode } from "react";

import type { DerivedView } from "../lib/derive";
import {
  HOPS,
  STATIONS,
  STATION_BY_ID,
  TIER_BY_ID,
  type StationId,
  type StationMeta,
} from "../lib/stations";
import type { Phase, Stage, TraceEvent } from "../types/events";

interface InspectorPanelProps {
  selected: StationId | null;
  view: DerivedView;
  onSelect: (id: StationId | null) => void;
}

export function InspectorPanel({ selected, view, onSelect }: InspectorPanelProps) {
  if (!selected) return <Overview onSelect={onSelect} />;

  const meta = STATION_BY_ID[selected];
  const rt = view.stations[selected];
  const lastEnd = pick(rt.events, undefined, "end");

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4" style={{ color: meta.accent }}>
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">{meta.icon}</span>
        <div className="flex-1">
          <div className="text-base font-semibold text-[var(--color-ink)]">{meta.title}</div>
          <div className="text-xs text-[var(--color-muted)]">{meta.subtitle}</div>
        </div>
        <StatusBadge status={rt.status} accent={meta.accent} />
      </div>

      <p className="text-[13px] leading-relaxed text-[#aab6d8]">{meta.blurb}</p>

      <div className="flex flex-wrap gap-1.5">
        {lastEnd?.metrics.latency_ms !== undefined && (
          <Chip>{lastEnd.metrics.latency_ms.toFixed(0)} ms</Chip>
        )}
        <Chip>
          {rt.events.length} event{rt.events.length === 1 ? "" : "s"}
        </Chip>
      </div>

      <TechSection meta={meta} />
      {renderDetail(selected, rt.events)}
    </div>
  );
}

function TechSection({ meta }: { meta: StationMeta }) {
  const tier = TIER_BY_ID[meta.tier];
  const hops = HOPS.filter((h) => h.source === meta.id || h.target === meta.id);

  return (
    <Section title="Technical & infrastructure">
      {meta.tech.map((row) => (
        <KeyVal key={row.k} k={row.k} v={row.v} />
      ))}
      <div className="my-2 h-px bg-[var(--color-line)]" />
      <KeyVal k="tier" v={tier.title} />
      <KeyVal k="hosting (e.g.)" v={meta.azure} />

      {hops.length > 0 && (
        <Labeled label="network hops">
          <div className="space-y-1">
            {hops.map((h) => {
              const outgoing = h.source === meta.id;
              const other = STATION_BY_ID[outgoing ? h.target : h.source];
              return (
                <div key={`${h.source}-${h.target}`} className="text-[11px] text-[#aab6d8]">
                  <span className="font-mono">
                    {outgoing ? "→" : "←"} {other.title}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    {" "}
                    · {h.secure ? "🔒 " : ""}
                    {h.protocol}
                  </span>
                  <div className="pl-3 text-[10.5px] text-[#5b688c]">{h.detail}</div>
                </div>
              );
            })}
          </div>
        </Labeled>
      )}
    </Section>
  );
}

function renderDetail(id: StationId, events: TraceEvent[]) {
  switch (id) {
    case "frontend": {
      const msg = events.find((e) => typeof e.data.message === "string")?.data.message as string | undefined;
      const respond = pick(events, "respond", "end");
      return (
        <>
          {msg && (
            <Section title="Request sent">
              <Mono>{msg}</Mono>
            </Section>
          )}
          {respond?.data.answer !== undefined && (
            <Section title="Answer received">
              <Mono>{String(respond.data.answer)}</Mono>
            </Section>
          )}
        </>
      );
    }
    case "backend": {
      const ev = pick(events, "backend", "end");
      const routes = ["POST /api/chat", "GET /api/trace/{id}", "GET /api/health"];
      return (
        <Section title="Routes">
          {routes.map((r) => (
            <Mono key={r}>{r}</Mono>
          ))}
          {ev && <KeyVal k="demo mode" v={String(ev.data.demo_mode ?? "—")} />}
        </Section>
      );
    }
    case "agent": {
      const route = pick(events, "agent.route");
      const thinks = events.filter((e) => e.stage === "agent.think" && e.phase === "end");
      const lastThink = thinks[thinks.length - 1];
      const calls = (lastThink?.data.tool_calls as Array<{ name: string; args: unknown }>) ?? [];
      return (
        <>
          {route?.data.query !== undefined && (
            <Section title="Query">
              <Mono>{String(route.data.query)}</Mono>
            </Section>
          )}
          {thinks.length > 0 && (
            <Section title="Agent loop">
              <KeyVal k="reasoning turns" v={String(thinks.length)} />
              <KeyVal k="last decision" v={String(lastThink?.data.decision ?? "—")} />
              {calls.length > 0 && (
                <div className="mt-1 space-y-1">
                  {calls.map((c, i) => (
                    <Mono key={i}>
                      {c.name}({JSON.stringify(c.args)})
                    </Mono>
                  ))}
                </div>
              )}
            </Section>
          )}
        </>
      );
    }
    case "rag": {
      const embed = pick(events, "rag.embed", "end");
      const retrieve = pick(events, "rag.retrieve", "end");
      const chunks = (retrieve?.data.chunks as Array<RagChunk>) ?? [];
      return (
        <>
          {embed && (
            <Section title="Query embedding">
              <KeyVal k="model" v={String(embed.data.model ?? "—")} />
              <KeyVal k="dimensions" v={String(embed.data.dim ?? "—")} />
              {Array.isArray(embed.data.preview) && (
                <Mono>[{(embed.data.preview as number[]).map((n) => n.toFixed(3)).join(", ")}, …]</Mono>
              )}
            </Section>
          )}
          {chunks.length > 0 && (
            <Section title={`Retrieved chunks (top-${chunks.length})`}>
              <div className="space-y-2">
                {chunks.map((c, i) => (
                  <div key={i} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-[#aab6d8]">{c.source}</span>
                      <span className="font-mono text-emerald-300">{c.score.toFixed(3)}</span>
                    </div>
                    <ScoreBar value={c.score} />
                    <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[#8694b8]">{c.text}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      );
    }
    case "mcp": {
      const discover = pick(events, "mcp.discover", "end");
      const tools = (discover?.data.tools as Array<{ name: string; description: string }>) ?? [];
      const calls = events.filter((e) => e.stage === "mcp.call" && e.phase === "end");
      return (
        <>
          {discover && (
            <Section title="Discovered tools">
              <KeyVal k="transport" v={String(discover.data.transport ?? "—")} />
              <div className="mt-1 space-y-1">
                {tools.map((t) => (
                  <div key={t.name}>
                    <div className="font-mono text-[12px] text-[var(--color-ink)]">{t.name}</div>
                    <div className="text-[11px] text-[#8694b8]">{t.description}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {calls.map((call, i) => (
            <Section key={i} title="Tool call">
              <KeyVal k="tool" v={String(call.data.tool)} />
              <KeyVal k="args" v={JSON.stringify(call.data.args)} />
              <KeyVal k="result" v={String(call.data.result)} />
            </Section>
          ))}
        </>
      );
    }
    case "llm": {
      const prompt = pick(events, "llm.prompt", "end");
      const gen = pick(events, "llm.generate", "end");
      const preview = (prompt?.data ?? {}) as PromptPreview;
      return (
        <>
          {prompt && (
            <Section title="Assembled prompt">
              {preview.system && (
                <Labeled label="system">
                  <Scroll>{preview.system}</Scroll>
                </Labeled>
              )}
              {preview.context && (
                <Labeled label="retrieved context">
                  <Scroll>{preview.context}</Scroll>
                </Labeled>
              )}
              {Array.isArray(preview.tools) && preview.tools.length > 0 && (
                <Labeled label="tools">
                  <div className="flex flex-wrap gap-1">
                    {preview.tools.map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </div>
                </Labeled>
              )}
            </Section>
          )}
          {gen?.data.answer !== undefined && (
            <Section title="Generated answer">
              <KeyVal k="model" v={String(gen.data.model ?? "—")} />
              <Mono>{String(gen.data.answer)}</Mono>
            </Section>
          )}
        </>
      );
    }
  }
}

// --- small presentational helpers ------------------------------------------

interface RagChunk {
  text: string;
  source: string;
  title: string;
  score: number;
}
interface PromptPreview {
  system?: string;
  context?: string;
  tools?: string[];
}

function pick(events: TraceEvent[], stage?: Stage, phase?: Phase): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((stage === undefined || e.stage === stage) && (phase === undefined || e.phase === phase)) {
      return e;
    }
  }
  return undefined;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] p-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12px]">
      <span className="shrink-0 text-[var(--color-muted)]">{k}</span>
      <span className="break-all text-right font-mono text-[var(--color-ink)]">{v}</span>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-[#5b688c]">{label}</div>
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

function Scroll({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[#aab6d8]">
      {children}
    </pre>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10.5px] text-[#aab6d8]">
      {children}
    </span>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
      <div
        className="h-full rounded-full bg-emerald-400"
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

function StatusBadge({ status, accent }: { status: string; accent: string }) {
  const label = status === "active" ? "active" : status === "done" ? "done" : "idle";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: status === "idle" ? "#5b688c" : accent,
        border: `1px solid ${status === "idle" ? "var(--color-line)" : accent}`,
      }}
    >
      {label}
    </span>
  );
}

function Overview({ onSelect }: { onSelect: (id: StationId) => void }) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">Inspector</h2>
      <p className="text-[13px] leading-relaxed text-[#aab6d8]">
        The pipeline is split into deployable <strong>tiers</strong> (containers) that talk over
        the network. Send a message, then click any station to inspect the real data — protocols
        and routes, retrieved chunks and scores, tool calls, the assembled prompt, and latency.
      </p>
      <div className="space-y-1.5">
        {STATIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-left transition hover:border-sky-400/50"
          >
            <span className="text-lg">{s.icon}</span>
            <span className="text-[13px] text-[var(--color-ink)]">{s.title}</span>
            <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">{s.azure}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
