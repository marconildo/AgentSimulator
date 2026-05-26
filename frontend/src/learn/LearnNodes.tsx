import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useT } from "../i18n";
import type { Section, Topic } from "./content";

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
