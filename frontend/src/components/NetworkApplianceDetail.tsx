import { useMemo } from "react";

import { useT } from "../i18n";
import { selectApiGw, selectCdn, selectDns, selectLb, selectWaf } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { DetailShell, KeyVal, Mono, Scroll, Section } from "./DetailShell";

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
          [L.cdn.age, d?.age],
          [L.cdn.server, d?.server],
        ]),
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
          [L.waf.rules, d?.rules],
          [L.waf.anomaly, d?.anomaly_score],
          [L.waf.engine, d?.engine],
        ]),
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
          [L.lb.upstream, d?.upstream],
          [L.lb.server, d?.server],
        ]),
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
          [L.apigw.rateLimit, d?.rate_limit_remaining],
          [L.apigw.upstreamLatency, d?.upstream_latency_ms],
          [L.apigw.gateway, d?.gateway],
        ]),
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

  return (
    <DetailShell
      accent={accent}
      icon={ICON[kind]}
      title={La.title}
      subtitle={La.subtitle}
      back={L.back}
      onClose={onClose}
      empty={!p.seen}
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
        <Mono>{La.inDesc}</Mono>
        {p.inRows.map((r) => (
          <KeyVal key={r.k} k={r.k} v={r.v} />
        ))}
      </Section>

      <Section title={L.out} accent={accent}>
        {p.outRows.map((r) => (
          <KeyVal key={r.k} k={r.k} v={r.v} />
        ))}
      </Section>

      <Section title={L.evidence}>
        <Scroll>{JSON.stringify(p.raw, null, 2)}</Scroll>
      </Section>
    </DetailShell>
  );
}
