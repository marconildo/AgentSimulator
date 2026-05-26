import type { ReactNode } from "react";

import { useLang, useT, type Lang } from "../i18n";
import type { Strings } from "../i18n/strings";
import { CLOUDS, cloudValue, useCloud } from "../lib/cloud";
import type { DerivedView } from "../lib/derive";
import { useSettings } from "../lib/settings";
import {
  hopsFor,
  stationByIdFor,
  stationsFor,
  tierByIdFor,
  type StationId,
  type StationMeta,
} from "../lib/stations";
import type { Phase, Stage, TraceEvent } from "../types/events";

type I = Strings["inspector"];

interface InspectorPanelProps {
  selected: StationId | null;
  view: DerivedView;
  onSelect: (id: StationId | null) => void;
}

export function InspectorPanel({ selected, view, onSelect }: InspectorPanelProps) {
  const lang = useLang((s) => s.lang);
  const t = useT();
  const i = t.inspector;

  if (!selected) return <Overview onSelect={onSelect} stations={stationsFor(lang)} i={i} />;

  const meta = stationByIdFor(lang)[selected];
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
        <StatusBadge status={rt.status} accent={meta.accent} i={i} />
      </div>

      <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{meta.blurb}</p>

      <div className="flex flex-wrap gap-1.5">
        {lastEnd?.metrics.latency_ms !== undefined && (
          <Chip>{lastEnd.metrics.latency_ms.toFixed(0)} ms</Chip>
        )}
        <Chip>{i.events(rt.events.length)}</Chip>
      </div>

      <TechSection meta={meta} lang={lang} i={i} />
      {renderDetail(selected, rt.events, i)}
    </div>
  );
}

function TechSection({ meta, lang, i }: { meta: StationMeta; lang: Lang; i: I }) {
  const cloud = useCloud((s) => s.cloud);
  const mode = useSettings((s) => s.mode);
  const comms = useT().comms;
  const tier = tierByIdFor(lang)[meta.tier];
  const stationById = stationByIdFor(lang);
  const hops = hopsFor(lang).filter((h) => h.source === meta.id || h.target === meta.id);
  const cloudName = CLOUDS.find((c) => c.code === cloud)?.label ?? cloud;

  return (
    <Section title={i.techInfra}>
      {meta.tech.map((row) => (
        <KeyVal key={row.k} k={row.k} v={row.v} />
      ))}
      <div className="my-2 h-px bg-[var(--color-line)]" />
      <KeyVal k={i.tier} v={`${tier.title} · ${tier.alias}`} />
      <KeyVal k={i.role} v={meta.generic} />
      {cloud !== "generic" && (
        <KeyVal k={i.cloudExample(cloudName)} v={cloudValue(meta, cloud)} />
      )}

      {hops.length > 0 && (
        <Labeled label={i.networkHops}>
          <div className="space-y-1.5">
            {hops.map((h) => {
              const outgoing = h.source === meta.id;
              const other = stationById[outgoing ? h.target : h.source];
              const zoneLabel = h.zone === "public" ? i.zonePublic : i.zonePrivate;
              const id = `${h.source}-${h.target}`;
              // The two streaming-capable hops flip async → sync under batch.
              const comm =
                id === "frontend-backend" || id === "agent-llm"
                  ? mode === "stream"
                    ? "async"
                    : "sync"
                  : h.comm;
              return (
                <div key={id} className="text-[11px] text-[var(--color-text-soft)]">
                  <span className="font-mono">
                    {outgoing ? "→" : "←"} {other.title}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    {" "}
                    · {h.secure ? "🔒 " : ""}
                    {h.protocol}
                  </span>
                  <div className="pl-3 text-[10.5px] text-[var(--color-label)]">{h.detail}</div>
                  <div className="pl-3 text-[10px] text-[var(--color-label)]">
                    {h.zone === "public" ? "🛡️" : "🔒"} {zoneLabel} · {h.controls}
                  </div>
                  <div
                    className="pl-3 text-[10px] font-mono"
                    style={{ color: comm === "async" ? "var(--color-sky-soft)" : "var(--color-sync)" }}
                  >
                    {comm === "async" ? "⇅ " : "⇄ "}
                    {comm} · {comm === "async" ? comms.asyncDetail : comms.syncDetail}
                  </div>
                </div>
              );
            })}
          </div>
        </Labeled>
      )}
    </Section>
  );
}

function renderDetail(id: StationId, events: TraceEvent[], i: I) {
  switch (id) {
    case "frontend": {
      const msg = events.find((e) => typeof e.data.message === "string")?.data.message as string | undefined;
      const respond = pick(events, "respond", "end");
      return (
        <>
          {msg && (
            <Section title={i.requestSent}>
              <Mono>{msg}</Mono>
            </Section>
          )}
          {respond?.data.answer !== undefined && (
            <Section title={i.answerReceived}>
              <Mono>{String(respond.data.answer)}</Mono>
            </Section>
          )}
        </>
      );
    }
    case "backend": {
      const routes = ["POST /api/chat", "GET /api/trace/{id}", "GET /api/health"];
      return (
        <Section title={i.routes}>
          {routes.map((r) => (
            <Mono key={r}>{r}</Mono>
          ))}
        </Section>
      );
    }
    case "database": {
      const read = pick(events, "db.read", "end");
      const write = pick(events, "db.write", "end");
      const recent = (read?.data.recent as Array<{ message: string; answer: string }> | undefined) ?? [];
      return (
        <>
          {read && (
            <Section title={i.historyRead}>
              <KeyVal k={i.totalRows} v={String(read.data.total_rows ?? 0)} />
              {recent.length > 0 ? (
                <Labeled label={i.recentMessages}>
                  <div className="space-y-1">
                    {recent.map((m, idx) => (
                      <Mono key={idx}>{m.message}</Mono>
                    ))}
                  </div>
                </Labeled>
              ) : (
                <p className="text-[11px] text-[var(--color-label)]">{i.noHistory}</p>
              )}
            </Section>
          )}
          {write && (
            <Section title={i.persisted}>
              <KeyVal k={i.operation} v={String(write.data.operation ?? "INSERT")} />
              <KeyVal k={i.totalRows} v={String(write.data.total_rows ?? "—")} />
            </Section>
          )}
        </>
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
            <Section title={i.query}>
              <Mono>{String(route.data.query)}</Mono>
            </Section>
          )}
          {thinks.length > 0 && (
            <Section title={i.agentLoop}>
              <KeyVal k={i.reasoningTurns} v={String(thinks.length)} />
              <KeyVal k={i.lastDecision} v={String(lastThink?.data.decision ?? "—")} />
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
            <Section title={i.queryEmbedding}>
              <KeyVal k={i.model} v={String(embed.data.model ?? "—")} />
              <KeyVal k={i.dimensions} v={String(embed.data.dim ?? "—")} />
              {Array.isArray(embed.data.preview) && (
                <Mono>[{(embed.data.preview as number[]).map((n) => n.toFixed(3)).join(", ")}, …]</Mono>
              )}
            </Section>
          )}
          {chunks.length > 0 && (
            <Section title={i.retrievedChunks(chunks.length)}>
              <div className="space-y-2">
                {chunks.map((c, i) => (
                  <div key={i} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-[var(--color-text-soft)]">{c.source}</span>
                      <span className="font-mono text-[var(--color-ok-soft)]">{c.score.toFixed(3)}</span>
                    </div>
                    <ScoreBar value={c.score} />
                    <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[var(--color-muted)]">{c.text}</p>
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
            <Section title={i.discoveredTools}>
              <KeyVal k={i.transport} v={String(discover.data.transport ?? "—")} />
              <div className="mt-1 space-y-1">
                {tools.map((t) => (
                  <div key={t.name}>
                    <div className="font-mono text-[12px] text-[var(--color-ink)]">{t.name}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">{t.description}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {calls.map((call, idx) => (
            <Section key={idx} title={i.toolCall}>
              <KeyVal k={i.tool} v={String(call.data.tool)} />
              <KeyVal k={i.args} v={JSON.stringify(call.data.args)} />
              <KeyVal k={i.result} v={String(call.data.result)} />
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
            <Section title={i.assembledPrompt}>
              {preview.system && (
                <Labeled label={i.system}>
                  <Scroll>{preview.system}</Scroll>
                </Labeled>
              )}
              {preview.context && (
                <Labeled label={i.retrievedContext}>
                  <Scroll>{preview.context}</Scroll>
                </Labeled>
              )}
              {Array.isArray(preview.tools) && preview.tools.length > 0 && (
                <Labeled label={i.tools}>
                  <div className="flex flex-wrap gap-1">
                    {preview.tools.map((tool) => (
                      <Chip key={tool}>{tool}</Chip>
                    ))}
                  </div>
                </Labeled>
              )}
            </Section>
          )}
          {gen?.data.answer !== undefined && (
            <Section title={i.generatedAnswer}>
              <KeyVal k={i.model} v={String(gen.data.model ?? "—")} />
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

function Scroll({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-text-soft)]">
      {children}
    </pre>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-soft)]">
      {children}
    </span>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
      <div
        className="h-full rounded-full bg-[var(--color-ok)]"
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

function StatusBadge({ status, accent, i }: { status: string; accent: string; i: I }) {
  const label = status === "active" ? i.status.active : status === "done" ? i.status.done : i.status.idle;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: status === "idle" ? "var(--color-label)" : accent,
        border: `1px solid ${status === "idle" ? "var(--color-line)" : accent}`,
      }}
    >
      {label}
    </span>
  );
}

function Overview({
  onSelect,
  stations,
  i,
}: {
  onSelect: (id: StationId) => void;
  stations: StationMeta[];
  i: I;
}) {
  const cloud = useCloud((s) => s.cloud);
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">{i.overviewTitle}</h2>
      <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{i.overviewBody}</p>
      <div className="space-y-1.5">
        {stations.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-left transition hover:border-[color-mix(in_srgb,var(--color-sky)_50%,transparent)]"
          >
            <span className="text-lg">{s.icon}</span>
            <span className="text-[13px] text-[var(--color-ink)]">{s.title}</span>
            <span className="ml-auto truncate pl-2 font-mono text-[10px] text-[var(--color-muted)]">
              {cloudValue(s, cloud)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
