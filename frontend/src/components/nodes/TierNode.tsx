import type { NodeProps } from "@xyflow/react";

import type { TierMeta } from "../../lib/stations";

export interface TierNodeData {
  meta: TierMeta;
  service: string; // resolved for the active cloud ("generic" → the role)
  [key: string]: unknown;
}

// A non-interactive background box that visually groups stations into a
// deployable tier (container). The title is the friendly name; the alias is the
// canonical n-tier term. Clicks pass through to the pane below.
export function TierNode(props: NodeProps) {
  const { meta, service } = props.data as TierNodeData;
  // The cloud line is proper nouns (e.g. "App Runner / ECS Fargate + ALB") the
  // overlay deliberately doesn't translate. Append the tier's generic role so a
  // hover answers "what is this / why is it here" without defining each acronym.
  const serviceTitle = service === meta.generic ? service : `${service} — ${meta.generic}`;
  return (
    <div
      className="pointer-events-none h-full w-full rounded-2xl"
      style={{
        border: `1px dashed color-mix(in srgb, ${meta.accent} 33%, transparent)`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${meta.accent} 5%, transparent) 0%, transparent 60%)`,
      }}
    >
      <div className="flex items-baseline gap-1.5 overflow-hidden px-3 pt-2">
        <span
          className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: meta.accent }}
        >
          {meta.title}
        </span>
        <span
          title={meta.alias}
          className="min-w-0 truncate text-[9px] uppercase tracking-wider text-[var(--color-muted)]"
        >
          {meta.alias}
        </span>
      </div>
      {/* The cloud service line can concatenate several proper nouns (e.g.
          "Cloud Storage + Cloud CDN + Cloud Armor") and overflow the box —
          clip with ellipsis and reveal the full list on hover. */}
      <div title={serviceTitle} className="truncate px-3 text-[10px] leading-tight text-[var(--color-muted)]">
        <span className="font-mono">{service}</span>
      </div>
    </div>
  );
}
