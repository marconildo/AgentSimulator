import { useMemo, useState } from "react";

import { useLang, useT } from "../i18n";
import { phaseLabelsFor } from "../lib/phases";
import { formatLatency } from "../lib/time";
import { waterfallSegments } from "../lib/waterfall";
import { useSimulator } from "../store/useSimulator";

// 015-latency-waterfall — a Chrome-DevTools-style timing breakdown of the run,
// rendered in the Inspector Overview (the whole-run summary). Pure projection of
// `waterfallSegments`: each timed phase occurrence is a proportional bar (the two
// LLM reasoning rounds and the tool round visibly dominate), plus the reconciling
// overhead/transit bar. Collapsible; tokens only (theme guard).
export function TimingPanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const events = useSimulator((s) => s.events);
  const [open, setOpen] = useState(true);

  const { segments, totalMs } = useMemo(() => waterfallSegments(events), [events]);
  const phaseLabels = phaseLabelsFor(lang);
  const labelFor = (label: string) =>
    label === "overhead"
      ? t.timeline.timing.overhead
      : phaseLabels[label as keyof typeof phaseLabels];

  const hasRun = segments.length > 0 && totalMs > 0;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold text-[var(--color-ink)] transition hover:text-[var(--color-sky-soft)]"
      >
        <span className="text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
        <span>📊</span>
        <span>{t.timeline.timing.title}</span>
        <div className="flex-1" />
        {hasRun && (
          <span className="tabular-nums font-mono text-[10px] text-[var(--color-label)]">
            {t.timeline.timing.total} {formatLatency(totalMs)}
          </span>
        )}
      </button>

      {open &&
        (hasRun ? (
          <div className="mt-1.5 space-y-1">
            {segments.map((seg, i) => {
              const pct = totalMs > 0 ? (seg.durationMs / totalMs) * 100 : 0;
              const isOverhead = seg.label === "overhead";
              return (
                <div
                  key={`${seg.label}-${i}`}
                  className="flex items-center gap-2 text-[10px]"
                  title={`${labelFor(seg.label)} · ${formatLatency(seg.durationMs)}`}
                >
                  <span className="w-[68px] shrink-0 truncate text-[var(--color-text-soft)]">
                    {labelFor(seg.label)}
                  </span>
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        isOverhead
                          ? "bg-[color-mix(in_srgb,var(--color-muted)_45%,transparent)]"
                          : "bg-[var(--color-sky-strong)]"
                      }`}
                      style={{ width: `${pct}%`, minWidth: seg.durationMs > 0 ? "2px" : 0 }}
                    />
                  </span>
                  <span className="w-[52px] shrink-0 text-right tabular-nums font-mono text-[var(--color-label)]">
                    {formatLatency(seg.durationMs)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">{t.timeline.timing.empty}</p>
        ))}
    </div>
  );
}
