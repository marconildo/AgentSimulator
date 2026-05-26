import type { ReactNode } from "react";

import { ALL_TOPICS, SECTIONS } from "./content";

interface TopicDetailProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function TopicDetail({ selected, onSelect }: TopicDetailProps) {
  const topicEntry = selected ? ALL_TOPICS[selected] : undefined;
  const section = selected ? SECTIONS.find((s) => s.id === selected) : undefined;

  if (topicEntry) {
    const { topic, section: sec } = topicEntry;
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
        <button
          onClick={() => onSelect(sec.id)}
          className="flex items-center gap-1.5 self-start text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: sec.accent }}
        >
          {sec.icon} {sec.title}
        </button>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{topic.title}</h2>

        <Block label="What it is" accent={sec.accent}>
          {topic.what}
        </Block>
        <Block label="Why it's used here" accent={sec.accent}>
          {topic.why}
        </Block>
        {topic.where && (
          <div>
            <Label accent={sec.accent}>In the project</Label>
            <code className="mt-1 block break-all rounded-lg bg-[var(--color-panel-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[#aab6d8]">
              {topic.where}
            </code>
          </div>
        )}

        <div className="mt-2">
          <Label accent={sec.accent}>More in {sec.title}</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sec.topics
              .filter((t) => t.id !== topic.id)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] transition hover:border-current"
                  style={{ color: sec.accent }}
                >
                  {t.title}
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  if (section) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
          <span className="text-2xl">{section.icon}</span>
          {section.title}
        </div>
        <p className="text-[13px] leading-relaxed text-[#aab6d8]">{section.intro}</p>
        <div className="space-y-1.5">
          {section.topics.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="block w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-left text-[13px] text-[var(--color-ink)] transition hover:border-current"
              style={{ color: section.accent }}
            >
              <span className="text-[var(--color-ink)]">{t.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Learn the stack</h2>
      <p className="text-[13px] leading-relaxed text-[#aab6d8]">
        This map explains how the simulator is built — its architecture and layers, the software
        and Gen-AI concepts it uses (and why), the security at each layer, the networking and
        infrastructure, and where data lives. Click any node to read about it.
      </p>
      <div className="space-y-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-left transition hover:border-sky-400/50"
          >
            <span className="text-lg">{s.icon}</span>
            <span className="text-[13px] text-[var(--color-ink)]">{s.title}</span>
            <span className="ml-auto text-[11px] text-[var(--color-muted)]">
              {s.topics.length} topics
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Block({ label, accent, children }: { label: string; accent: string; children: ReactNode }) {
  return (
    <div>
      <Label accent={accent}>{label}</Label>
      <p className="mt-1 text-[13px] leading-relaxed text-[#cdd6f0]">{children}</p>
    </div>
  );
}

function Label({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
      {children}
    </div>
  );
}
