// Guided-tour transport (005-guided-tour). Lives in the Timeline next to the
// replay controls (Q4). Idle → a single "▶ Tour" call-to-action; while touring →
// pause/resume + stop. Disabled when there is no replayable trace (AC5).

import { useT } from "../i18n";
import { isTouring } from "../lib/tour";
import { useSimulator } from "../store/useSimulator";

export function TourControls() {
  const t = useT();
  const hasEvents = useSimulator((s) => s.events.length > 0);
  const tour = useSimulator((s) => s.tour);
  const startTour = useSimulator((s) => s.startTour);
  const pauseTour = useSimulator((s) => s.pauseTour);
  const resumeTour = useSimulator((s) => s.resumeTour);
  const stopTour = useSimulator((s) => s.stopTour);

  if (!isTouring(tour)) {
    return (
      <button
        onClick={startTour}
        disabled={!hasEvents}
        title={t.tour.start}
        className="flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--color-violet)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-violet)_14%,transparent)] px-3 py-1 text-[11px] font-semibold text-[var(--color-violet-soft)] transition enabled:hover:bg-[color-mix(in_srgb,var(--color-violet)_26%,transparent)] disabled:opacity-30"
      >
        {t.tour.start}
      </button>
    );
  }

  const paused = tour.status === "paused";
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={paused ? resumeTour : pauseTour}
        title={paused ? t.tour.resume : t.tour.pause}
        aria-label={paused ? t.tour.resume : t.tour.pause}
        className="flex items-center gap-1 rounded-full bg-[var(--color-violet)] px-3 py-1 text-[11px] font-semibold text-[var(--color-on-accent)] shadow-sm shadow-[color-mix(in_srgb,var(--color-violet)_35%,transparent)] transition hover:opacity-90"
      >
        {paused ? "▶" : "⏸"} {paused ? t.tour.resume : t.tour.pause}
      </button>
      <button
        onClick={stopTour}
        title={t.tour.stop}
        aria-label={t.tour.stop}
        className="flex h-7 items-center rounded-full border border-[var(--color-line)] px-2.5 text-[11px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-rose)_60%,transparent)] hover:text-[var(--color-rose-soft)]"
      >
        ⏹
      </button>
    </div>
  );
}
