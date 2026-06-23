import { useMemo } from "react";

import { useT } from "../i18n";
import { buildApplianceLog } from "../lib/networkLog";
import {
  selectApiGw,
  selectCdn,
  selectDns,
  selectInboundRequest,
  selectLb,
  selectWaf,
} from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { Caption, DetailShell, KeyVal, Mono, Scroll, Section } from "./DetailShell";

// 089-network-station-detail — the "open full view" overlay shared by the five
// ingress appliances (DNS / CDN / WAF / TLS-LB / API Gateway). The Inspector keeps
// the theory (role / why / controls / chain on the hops); this box shows the
// per-run data as an In → Out story built from the appliance's forwarded-header
// evidence, plus the verbatim headers. Pure projection of the visible cursor slice
// (step/replay safe); honest empty state when the appliance isn't in front
// (`seen: false` or no event yet — never fabricates values, constitution §3).

export type NetworkKind = "dns" | "cdn" | "waf" | "lb" | "apigw";

const ACCENT: Record<NetworkKind, string> = {
  dns: "var(--color-sky)",
  cdn: "var(--color-blue)",
  waf: "var(--color-warn)",
  lb: "var(--color-violet)",
  apigw: "var(--color-indigo)",
};
const ICON: Record<NetworkKind, string> = {
  dns: "🧭",
  cdn: "⚡",
  waf: "🛡️",
  lb: "⚖️",
  apigw: "🚪",
};

type Row = { k: string; v: string };

// Keep a row only when the appliance actually reported the value; `0` is a real
// reading (anomaly score 0, age 0, rate-limit 0) so it must pass the filter.
function rows(pairs: [string, unknown][]): Row[] {
  return pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({ k, v: String(v) }));
}

interface Projected {
  seen: boolean;
  raw: Record<string, unknown>;
  inRows: Row[];
  outRows: Row[];
  // 091 — an honest caption when something is absent (DNS not resolved, WAF score
  // not forwarded). Shown so a `null` reads as a real reason, not a missing field.
  note?: string;
  // 091 — the reconstructed access-log line, built from the same evidence.
  log: string;
}

type Net = ReturnType<typeof useT>["networkDetail"];

function project(kind: NetworkKind, events: TraceEvent[], L: Net): Projected {
  switch (kind) {
    case "dns": {
      const d = selectDns(events);
      return {
        seen: Boolean(d?.seen),
        raw: (d as unknown as Record<string, unknown>) ?? {},
        inRows: rows([[L.dns.host, d?.host]]),
        outRows: rows([
          [L.dns.address, d?.address],
          [L.dns.ttl, d?.ttl],
        ]),
        note: d?.seen && d?.address == null ? L.dns.notResolved : undefined,
        log: buildApplianceLog(kind, d ?? {}),
      };
    }
    case "cdn": {
      const d = selectCdn(events);
      return {
        seen: Boolean(d?.seen),
        raw: (d as unknown as Record<string, unknown>) ?? {},
        inRows: [],
        outRows: rows([
          [L.cdn.cache, d?.cache],
          [L.cdn.hits, d?.hits],
          [L.cdn.reason, d?.reason],
          [L.cdn.age, d?.age],
          [L.cdn.server, d?.server],
        ]),
        log: buildApplianceLog(kind, d ?? {}),
      };
    }
    case "waf": {
      const d = selectWaf(events);
      return {
        seen: Boolean(d?.seen),
        raw: (d as unknown as Record<string, unknown>) ?? {},
        inRows: [],
        outRows: rows([
          [L.waf.status, d?.status],
          [L.waf.paranoia, d?.paranoia],
          [L.waf.threshold, d?.threshold],
          [L.waf.anomaly, d?.anomaly_score],
          [L.waf.rules, d?.rules],
          [L.waf.engine, d?.engine],
        ]),
        // The runtime anomaly score can't be forwarded by ModSecurity v3 — say so.
        note: d?.seen && d?.anomaly_score == null ? L.waf.anomalyNote : undefined,
        log: buildApplianceLog(kind, d ?? {}),
      };
    }
    case "lb": {
      const d = selectLb(events);
      return {
        seen: Boolean(d?.seen),
        raw: (d as unknown as Record<string, unknown>) ?? {},
        inRows: [],
        outRows: rows([
          [L.lb.tls, d?.tls_version],
          [L.lb.scheme, d?.scheme],
          [L.lb.poolSize, d?.pool_size],
          [L.lb.algorithm, d?.algorithm],
          [L.lb.backend, d?.backend],
          [L.lb.upstream, d?.upstream],
          [L.lb.server, d?.server],
        ]),
        log: buildApplianceLog(kind, d ?? {}),
      };
    }
    case "apigw": {
      const d = selectApiGw(events);
      return {
        seen: Boolean(d?.seen),
        raw: (d as unknown as Record<string, unknown>) ?? {},
        inRows: [],
        outRows: rows([
          [L.apigw.route, d?.route],
          [L.apigw.policy, d?.policy],
          [L.apigw.rateLimit, d?.rate_limit_remaining],
          [L.apigw.upstreamLatency, d?.upstream_latency_ms],
          [L.apigw.gateway, d?.gateway],
        ]),
        log: buildApplianceLog(kind, d ?? {}),
      };
    }
  }
}

export function NetworkApplianceDetail({
  kind,
  onClose,
}: {
  kind: NetworkKind;
  onClose: () => void;
}) {
  const t = useT();
  const L = t.networkDetail;
  const La = L[kind];
  const accent = ACCENT[kind];

  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );

  const p = useMemo(() => project(kind, visible, L), [kind, visible, L]);
  // 092 — the real request that entered this appliance (shown as IN for the HTTP
  // appliances; DNS keeps its host-name input). A pure projection of the trace.
  const inbound = useMemo(() => selectInboundRequest(visible), [visible]);
  // 093-waf-block-visualization — when the WAF blocked this turn there is no trace
  // (the request never reached the backend), so the WAF box reads the outcome from
  // the store and renders a dedicated "blocked" view that explains why.
  const blockedOutcome = useSimulator((s) => s.blocked);
  const wafBlocked = kind === "waf" ? blockedOutcome : null;

  return (
    <DetailShell
      accent={accent}
      icon={ICON[kind]}
      title={La.title}
      subtitle={La.subtitle}
      back={L.back}
      onClose={onClose}
      empty={!p.seen && !wafBlocked}
      emptyText={La.empty}
    >
      <Section title={L.did} accent={accent}>
        <Mono>{La.summary}</Mono>
        {kind === "lb" && (
          <p className="mt-1.5 text-[11px] font-semibold" style={{ color: accent }}>
            ⇄ {L.lb.role}
          </p>
        )}
      </Section>

      <Section title={L.in} accent={accent}>
        {wafBlocked ? (
          // The real payload that tripped the WAF (held in the blocked outcome).
          <>
            <KeyVal k={L.requestLine} v="POST /api/chat" />
            <Caption>{L.message}</Caption>
            <Mono>{wafBlocked.message}</Mono>
          </>
        ) : kind === "dns" ? (
          // DNS operates on a name, not the HTTP request — its input IS the host.
          p.inRows.length ? (
            p.inRows.map((r) => <KeyVal key={r.k} k={r.k} v={r.v} />)
          ) : (
            <Mono>{L.noRequest}</Mono>
          )
        ) : inbound ? (
          // The real request that traversed this appliance (from the trace).
          <>
            <KeyVal k={L.requestLine} v="POST /api/chat" />
            {inbound.message && (
              <>
                <Caption>{L.message}</Caption>
                <Mono>{inbound.message}</Mono>
              </>
            )}
          </>
        ) : (
          <Mono>{L.noRequest}</Mono>
        )}
      </Section>

      <Section title={L.out} accent={accent}>
        {wafBlocked ? (
          <>
            <KeyVal k={L.waf.status} v="blocked" />
            <KeyVal k={L.waf.http} v={String(wafBlocked.httpStatus)} />
            <KeyVal k={L.waf.engine} v="modsecurity" />
            <p className="mt-1.5 text-[11px] font-semibold" style={{ color: accent }}>
              🛡️✋ {L.waf.blockedNote}
            </p>
            <p className="mt-1 text-[10.5px] leading-snug text-[var(--color-text-soft)]">
              {L.waf.blockedWhy}
            </p>
          </>
        ) : (
          <>
            {p.outRows.map((r) => (
              <KeyVal key={r.k} k={r.k} v={r.v} />
            ))}
            {p.note && (
              <p className="mt-1.5 text-[10.5px] italic leading-snug text-[var(--color-muted)]">
                {p.note}
              </p>
            )}
          </>
        )}
      </Section>

      {p.log && (
        <Section title={L.reconstructedLog} accent={accent}>
          <Scroll>{p.log}</Scroll>
          <p className="mt-1 text-[10px] italic leading-snug text-[var(--color-muted)]">
            {L.reconstructedLogHint}
          </p>
        </Section>
      )}

      <Section title={L.evidence}>
        <Scroll>{JSON.stringify(p.raw, null, 2)}</Scroll>
      </Section>
    </DetailShell>
  );
}
