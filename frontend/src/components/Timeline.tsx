import { type ReactNode, useMemo } from "react";

import { useT } from "../i18n";
import { activePhase, PHASE_ORDER, phaseMarkers } from "../lib/phases";
import { stationForEvent } from "../lib/stations";
import { useSimulator } from "../store/useSimulator";
import { EventConsole } from "./EventConsole";
import { TourControls } from "./TourControls";

export function Timeline() {
  const t = useT();
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const playing = useSimulator((s) => s.playing);
  const following = useSimulator((s) => s.following);
  const status = useSimulator((s) => s.status);
  const setCursor = useSimulator((s) => s.setCursor);
  const select = useSimulator((s) => s.select);
  const step = useSimulator((s) => s.step);
  const togglePlay = useSimulator((s) => s.togglePlay);

  // Jumping to a phase moves the playhead AND opens that phase's station in the
  // Inspector, so every chip has a consistent chip→node affinity (B5).
  const jumpToPhase = (index: number) => {
    setCursor(index);
    const station = stationForEvent(events, index);
    if (station) select(station);
  };

  const total = events.length;
  const hasEvents = total > 0;
  const current = cursor >= 0 ? events[cursor] : undefined;
  const live = status === "streaming" && following;

  // The named phases that actually occurred this run, keyed for O(1) lookup.
  const markers = useMemo(() => phaseMarkers(events), [events]);
  const markerByPhase = useMemo(
    () => new Map(markers.map((m) => [m.phase, m])),
    [markers],
  );
  // The phase the cursor is currently inside — the "you are here" chip.
  const active = activePhase(events, cursor);

  return (
    <div
      className="border-t-2 border-[color-mix(in_srgb,var(--color-sky)_25%,transparent)] px-4 py-3"
      style={{
        background:
          "linear-gradient(to bottom, color-mix(in srgb, var(--color-panel-2) 70%, transparent), var(--color-panel))",
      }}
    >
      {/* Header — makes it obvious this is an interactive replay scrubber. */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[15px] leading-none">⏱️</span>
        <span className="text-[12px] font-semibold text-[var(--color-ink)]">{t.timeline.title}</span>
        <span className="hidden text-[11px] text-[var(--color-muted)] sm:inline">
          {t.timeline.hint}
        </span>
        <div className="flex-1" />
        {live && (
          <span className="flex items-center gap-1 font-mono text-[11px] text-[var(--color-rose-soft)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-rose)]" /> LIVE
          </span>
        )}
        {current ? (
          <span className="max-w-[280px] truncate font-mono text-[11px]">
            <span className="rounded bg-[color-mix(in_srgb,var(--color-sky-strong)_15%,transparent)] px-1.5 py-0.5 font-semibold text-[var(--color-sky-soft)]">
              {current.stage}
            </span>
            {current.label ? (
              <span className="ml-1.5 text-[var(--color-muted)]">{current.label}</span>
            ) : null}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[var(--color-muted)]">{t.timeline.idle}</span>
        )}
        <span className="tabular-nums font-mono text-[11px] text-[var(--color-label)]">
          {hasEvents ? `${cursor + 1}/${total}` : "0/0"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <TourControls />
        <div className="flex items-center gap-1.5">
          <TButton onClick={() => step(-1)} disabled={!hasEvents} title={t.timeline.stepBack}>
            ⏮
          </TButton>
          <button
            onClick={togglePlay}
            disabled={!hasEvents}
            title={playing ? t.timeline.pause : t.timeline.replay}
            aria-label={playing ? t.timeline.pause : t.timeline.replay}
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-sky-strong)] text-[14px] text-[var(--color-on-accent)] shadow-lg shadow-[color-mix(in_srgb,var(--color-sky-strong)_30%,transparent)] transition enabled:hover:bg-[var(--color-sky)] disabled:opacity-30"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <TButton onClick={() => step(1)} disabled={!hasEvents} title={t.timeline.stepForward}>
            ⏭
          </TButton>
        </div>

        {/* Scrubber track — fine-grained, event-level scrubbing. */}
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={cursor < 0 ? 0 : cursor}
            disabled={!hasEvents}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-line)] accent-[var(--color-sky)] disabled:opacity-40"
          />
        </div>
      </div>

      {/* Phase rail — the named markers that replace the anonymous ticks. The
          full canonical pipeline is always shown (a fixed map); phases that
          didn't fire this run are disabled, and clicking a phase jumps the
          playhead to its first event. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {PHASE_ORDER.map((phase) => {
          const marker = markerByPhase.get(phase);
          return (
            <PhaseChip
              key={phase}
              label={t.timeline.phases[phase]}
              hint={t.tour.captions[phase]}
              count={marker?.count ?? 0}
              countHint={t.glossary.iterations}
              occurred={Boolean(marker)}
              passed={Boolean(marker && marker.index <= cursor)}
              active={active === phase}
              onClick={marker ? () => jumpToPhase(marker.index) : undefined}
            />
          );
        })}
      </div>

      {/* 030-event-console — the expandable structured trace log (collapsed by
          default; the one-line status above stays the "now" indicator). */}
      <EventConsole />
    </div>
  );
}

function PhaseChip({
  label,
  hint,
  count,
  countHint,
  occurred,
  passed,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  count: number;
  countHint: string;
  occurred: boolean;
  passed: boolean;
  active: boolean;
  onClick?: () => void;
}) {
  // Visual states: active ("you are here") > passed (lit) > upcoming (occurred,
  // dim) > absent (disabled). Only occurred phases are clickable.
  const cls = active
    ? "border-[var(--color-sky)] bg-[var(--color-sky-strong)] text-[var(--color-on-accent)] shadow-sm shadow-[color-mix(in_srgb,var(--color-sky-strong)_35%,transparent)]"
    : passed
      ? "border-[color-mix(in_srgb,var(--color-sky)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-sky-strong)_12%,transparent)] text-[var(--color-sky-soft)] enabled:hover:border-[var(--color-sky)]"
      : occurred
        ? "border-[var(--color-line)] text-[var(--color-muted)] enabled:hover:border-[color-mix(in_srgb,var(--color-sky)_50%,transparent)] enabled:hover:text-[var(--color-sky-soft)]"
        : "border-dashed border-[var(--color-line)] text-[var(--color-label)] opacity-40";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!occurred}
      title={hint}
      aria-current={active ? "step" : undefined}
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition disabled:cursor-default ${cls}`}
    >
      {label}
      {count > 1 && (
        <span
          className="cursor-help font-mono text-[9px] opacity-70"
          title={countHint}
          aria-label={`×${count}`}
        >
          ×{count}
        </span>
      )}
    </button>
  );
}

function TButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 w-9 items-center justify-center rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink)] transition enabled:hover:border-[color-mix(in_srgb,var(--color-sky)_60%,transparent)] enabled:hover:text-[var(--color-sky-soft)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
