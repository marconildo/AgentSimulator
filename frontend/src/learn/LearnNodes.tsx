import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useT } from "../i18n";
import { CLOUDS, type CloudId } from "../lib/cloud";
import { CLOUD_ACCENT, CLOUD_ICONS } from "../lib/cloudIcons";
import type { CloudGuideEntry, Section, Topic } from "./content";

const hideHandle = { opacity: 0, border: "none" } as const;

export function RootNode() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-5 py-3 text-center">
      <div className="text-sm font-semibold text-[var(--color-ink)]">{t.learn.rootTitle}</div>
      <div className="text-[11px] text-[var(--color-muted)]">{t.learn.rootHint}</div>
      <Handle type="source" position={Position.Bottom} style={hideHandle} />
    </div>
  );
}

export function SectionNode(props: NodeProps) {
  const { section } = props.data as { section: Section };
  return (
    <div
      className="w-[230px] rounded-xl px-3 py-2"
      style={{
        border: `1.5px solid ${section.accent}`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${section.accent} 13%, transparent), color-mix(in srgb, ${section.accent} 3%, transparent))`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{section.icon}</span>
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">{section.title}</span>
      </div>
      <Handle type="target" position={Position.Top} style={hideHandle} />
      <Handle type="source" position={Position.Bottom} style={hideHandle} />
    </div>
  );
}

// 024-learn-cloud-column — header of the "Build on {cloud}" column: the
// provider's brand mark + the reused `onCloud` title + a short hint.
export function CloudSectionNode(props: NodeProps) {
  const { cloud } = props.data as { cloud: CloudId };
  const t = useT();
  const accent = CLOUD_ACCENT[cloud];
  const label = CLOUDS.find((c) => c.code === cloud)?.label ?? cloud;
  const Icon = CLOUD_ICONS[cloud];
  return (
    <div
      className="w-[230px] rounded-xl px-3 py-2"
      style={{
        border: `1.5px solid ${accent}`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 13%, transparent), color-mix(in srgb, ${accent} 3%, transparent))`,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="text-lg" />
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">
          {t.learn.onCloud(label)}
        </span>
      </div>
      <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-muted)]">
        {t.learn.cloudGuideHint(label)}
      </div>
      <Handle type="target" position={Position.Top} style={hideHandle} />
      <Handle type="source" position={Position.Bottom} style={hideHandle} />
    </div>
  );
}

// A cloud column entry: the architectural layer over its concrete managed
// service. Clicking opens the layer's existing Learn topic (handled in LearnMap).
export function CloudTopicNode(props: NodeProps) {
  const { entry, cloud } = props.data as { entry: CloudGuideEntry; cloud: CloudId };
  const accent = CLOUD_ACCENT[cloud];
  return (
    <div
      className="w-[230px] cursor-pointer rounded-lg border bg-[var(--color-panel-2)] px-3 py-2 transition"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
        {entry.label}
      </div>
      <div className="text-[12.5px] text-[var(--color-ink)]">{entry.service}</div>
      <Handle type="target" position={Position.Top} style={hideHandle} />
      <Handle type="source" position={Position.Bottom} style={hideHandle} />
    </div>
  );
}

export function TopicNode(props: NodeProps) {
  const { topic, section, selected } = props.data as {
    topic: Topic;
    section: Section;
    selected: boolean;
  };
  return (
    <div
      className="w-[230px] cursor-pointer rounded-lg border bg-[var(--color-panel-2)] px-3 py-2 text-[12.5px] text-[var(--color-ink)] transition"
      style={{
        borderColor: selected ? section.accent : "var(--color-line)",
        boxShadow: selected ? `0 0 0 1.5px ${section.accent}, 0 8px 24px -14px ${section.accent}` : "none",
      }}
    >
      {topic.title}
      <Handle type="target" position={Position.Top} style={hideHandle} />
      <Handle type="source" position={Position.Bottom} style={hideHandle} />
    </div>
  );
}
