import { type ReactNode, useMemo } from "react";

import { useT } from "../i18n";
import { useSimulator } from "../store/useSimulator";

export function Timeline() {
  const t = useT();
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const playing = useSimulator((s) => s.playing);
  const following = useSimulator((s) => s.following);
  const status = useSimulator((s) => s.status);
  const setCursor = useSimulator((s) => s.setCursor);
  const step = useSimulator((s) => s.step);
  const togglePlay = useSimulator((s) => s.togglePlay);

  const total = events.length;
  const hasEvents = total > 0;
  const current = cursor >= 0 ? events[cursor] : undefined;
  const live = status === "streaming" && following;

  // A tick at every stage boundary (where the stage changes), so the ruler
  // shows each distinct step of the request — passed ticks lit, ahead dim.
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < events.length; i++) {
      if (i === 0 || events[i].stage !== events[i - 1].stage) out.push(i);
    }
    return out;
  }, [events]);

  const frac = (i: number) => (total > 1 ? i / (total - 1) : 0);

  return (
    <div
      className="border-t-2 border-sky-500/25 px-4 py-3"
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
          <span className="flex items-center gap-1 font-mono text-[11px] text-rose-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> LIVE
          </span>
        )}
        {current ? (
          <span className="max-w-[280px] truncate font-mono text-[11px]">
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-300">
              {current.stage}
            </span>
            {current.label ? (
              <span className="ml-1.5 text-[var(--color-muted)]">{current.label}</span>
            ) : null}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[var(--color-muted)]">{t.timeline.idle}</span>
        )}
        <span className="tabular-nums font-mono text-[11px] text-[#5b688c]">
          {hasEvents ? `${cursor + 1}/${total}` : "0/0"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <TButton onClick={() => step(-1)} disabled={!hasEvents} title={t.timeline.stepBack}>
            ⏮
          </TButton>
          <button
            onClick={togglePlay}
            disabled={!hasEvents}
            title={playing ? t.timeline.pause : t.timeline.replay}
            aria-label={playing ? t.timeline.pause : t.timeline.replay}
            className="grid h-9 w-9 place-items-center rounded-full bg-sky-500 text-[14px] text-[#04122a] shadow-lg shadow-sky-500/30 transition enabled:hover:bg-sky-400 disabled:opacity-30"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <TButton onClick={() => step(1)} disabled={!hasEvents} title={t.timeline.stepForward}>
            ⏭
          </TButton>
        </div>

        {/* Track + stage ruler. Ticks are inset to align with the thumb travel. */}
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={cursor < 0 ? 0 : cursor}
            disabled={!hasEvents}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-line)] accent-sky-400 disabled:opacity-40"
          />
          {hasEvents && (
            <div className="pointer-events-none absolute inset-x-0 top-full mt-1 h-2">
              {ticks.map((i) => (
                <span
                  key={i}
                  className="absolute top-0 h-2 w-px rounded-full"
                  style={{
                    left: `calc(${frac(i)} * (100% - 14px) + 7px)`,
                    background: i <= cursor ? "#7dd3fc" : "var(--color-line)",
                    opacity: i <= cursor ? 0.9 : 0.6,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
      className="flex h-8 w-9 items-center justify-center rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink)] transition enabled:hover:border-sky-400/60 enabled:hover:text-sky-300 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
