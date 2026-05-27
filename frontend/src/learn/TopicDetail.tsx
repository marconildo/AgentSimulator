import type { ReactNode } from "react";

import { useLang, useT } from "../i18n";
import { CLOUDS, useCloud } from "../lib/cloud";
import { allTopicsFor, cloudContentFor, sectionsFor } from "./content";

interface TopicDetailProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function TopicDetail({ selected, onSelect }: TopicDetailProps) {
  const lang = useLang((s) => s.lang);
  const cloud = useCloud((s) => s.cloud);
  const t = useT();
  const topicEntry = selected ? allTopicsFor(lang)[selected] : undefined;
  const section = selected ? sectionsFor(lang).find((s) => s.id === selected) : undefined;

  if (topicEntry) {
    const { topic, section: sec } = topicEntry;
    const cloudContent = cloudContentFor(topic, cloud, lang);
    const cloudLabel = CLOUDS.find((c) => c.code === cloud)?.label ?? cloud;
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

        <Block label={t.learn.whatItIs} accent={sec.accent}>
          {topic.what}
        </Block>
        <Block label={t.learn.whyUsed} accent={sec.accent}>
          {topic.why}
        </Block>
        <Block label={t.learn.howItWorks} accent={sec.accent}>
          {topic.how}
        </Block>
        <Block label={t.learn.otherOptions} accent={sec.accent}>
          {topic.options}
        </Block>
        {cloudContent && (
          <div>
            <Label accent={sec.accent}>{t.learn.onCloud(cloudLabel)}</Label>
            {cloudContent.service && (
              <code className="mt-1 block break-all rounded-lg bg-[var(--color-panel-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--color-text-soft)]">
                {cloudContent.service}
              </code>
            )}
            {cloudContent.note && (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-prose)]">
                {cloudContent.note}
              </p>
            )}
          </div>
        )}
        {topic.where && (
          <div>
            <Label accent={sec.accent}>{t.learn.inProject}</Label>
            <code className="mt-1 block break-all rounded-lg bg-[var(--color-panel-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--color-text-soft)]">
              {topic.where}
            </code>
          </div>
        )}
        {topic.links && topic.links.length > 0 && (
          <div>
            <Label accent={sec.accent}>{t.learn.studyLinks}</Label>
            <ul className="mt-1.5 space-y-1">
              {topic.links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12.5px] underline decoration-dotted underline-offset-2 transition hover:opacity-80"
                    style={{ color: sec.accent }}
                  >
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-2">
          <Label accent={sec.accent}>{t.learn.moreIn(sec.title)}</Label>
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
        <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{section.intro}</p>
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
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t.learn.learnStackTitle}</h2>
      <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{t.learn.learnStackBody}</p>
      <div className="space-y-1.5">
        {sectionsFor(lang).map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-left transition hover:border-[color-mix(in_srgb,var(--color-sky)_50%,transparent)]"
          >
            <span className="text-lg">{s.icon}</span>
            <span className="text-[13px] text-[var(--color-ink)]">{s.title}</span>
            <span className="ml-auto text-[11px] text-[var(--color-muted)]">
              {t.learn.topicsCount(s.topics.length)}
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
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-prose)]">{children}</p>
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
