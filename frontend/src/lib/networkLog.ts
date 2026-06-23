// 091-network-appliance-detail-enrichment — reconstruct a one-line, log-style summary
// of what an ingress appliance did, built PURELY from its forwarded-header evidence.
// Each token maps to a real field; absent fields are dropped (never printed as null).
// This is NOT a live container tail — the drill-in renders it under an explicit
// "reconstructed from forwarded evidence" label (honesty seam, §3).

import type { ApiGwData, CdnData, DnsData, LbData, WafData } from "../types/events";

export type NetworkKind = "dns" | "cdn" | "waf" | "lb" | "apigw";

type ApplianceData = Partial<DnsData & CdnData & WafData & LbData & ApiGwData>;

/** Join the present parts with " · " (a part is kept only when truthy or 0). */
function join(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => p != null && p !== "").join(" · ");
}

export function buildApplianceLog(kind: NetworkKind, data: ApplianceData): string {
  switch (kind) {
    case "dns": {
      const host = data.host ?? "?";
      const resolved =
        data.address != null
          ? `${data.address}${data.ttl != null ? ` · ttl ${data.ttl}s` : ""}`
          : "not resolved";
      return `${host} IN A → ${resolved}`;
    }
    case "cdn":
      return join([
        data.cache != null ? `X-Cache: ${data.cache}` : null,
        data.hits != null ? `hits ${data.hits}` : null,
        data.reason ?? null,
        data.server != null ? `via ${data.server}` : null,
      ]);
    case "waf":
      return join([
        data.status != null ? `verdict ${data.status}` : null,
        data.paranoia != null ? `PL${data.paranoia}` : null,
        data.threshold != null ? `anomaly threshold ${data.threshold}` : null,
        data.anomaly_score != null ? `anomaly ${data.anomaly_score}` : null,
        data.rules != null ? `${data.rules} rules matched` : null,
        data.engine != null ? `engine ${data.engine}` : null,
      ]);
    case "lb":
      return join([
        data.tls_version != null ? data.tls_version : null,
        data.upstream != null ? `upstream ${data.upstream}` : null,
        data.pool_size != null
          ? `pool ${data.pool_size}/${data.pool_size}${data.algorithm ? ` ${data.algorithm}` : ""}`
          : null,
        data.backend != null ? `chose ${data.backend}` : null,
        data.server != null ? `via ${data.server}` : null,
      ]);
    case "apigw":
      return join([
        data.route != null ? `route ${data.route}` : null,
        data.policy ?? null,
        data.gateway != null ? `gateway ${data.gateway}` : null,
      ]);
  }
}
