// Guided-tour transport (005-guided-tour → 014-tour-scripted). Lives in the
// Timeline next to the replay controls (Q4). Idle → a single call-to-action;
// while touring → pause/resume + stop. 014 supersedes 005's empty-state gating:
// with no run yet, ▶ Tour loads a bundled canned trace and previews the journey,
// so the control is always enabled (the label reads "preview" in that state).

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
  const tourPrevStep = useSimulator((s) => s.tourPrevStep);
  const tourNextStep = useSimulator((s) => s.tourNextStep);

  if (!isTouring(tour)) {
    // Empty state → louder "preview the journey" CTA (filled); with a run → the
    // quieter ▶ Tour affordance that walks the run you just saw.
    const label = hasEvents ? t.tour.start : t.tour.ctaEmpty;
    return (
      <button
        onClick={startTour}
        title={label}
        className={
          hasEvents
            ? "flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--color-violet)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-violet)_14%,transparent)] px-3 py-1 text-[11px] font-semibold text-[var(--color-violet-soft)] transition hover:bg-[color-mix(in_srgb,var(--color-violet)_26%,transparent)]"
            : "flex items-center gap-1 rounded-full bg-[var(--color-violet)] px-3.5 py-1 text-[11px] font-semibold text-[var(--color-on-accent)] shadow-sm shadow-[color-mix(in_srgb,var(--color-violet)_35%,transparent)] transition hover:opacity-90"
        }
      >
        {label}
      </button>
    );
  }

  const paused = tour.status === "paused";
  // Manual step controls flank the play/pause (037) — using them pauses the
  // auto-advance so the visitor reads each stop at their own pace.
  const stepCls =
    "grid h-7 w-7 place-items-center rounded-full border border-[var(--color-line)] text-[12px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-violet)_60%,transparent)] hover:text-[var(--color-violet-soft)]";
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={tourPrevStep} title={t.tour.prev} aria-label={t.tour.prev} className={stepCls}>
        ◀
      </button>
      <button
        onClick={paused ? resumeTour : pauseTour}
        title={paused ? t.tour.resume : t.tour.pause}
        aria-label={paused ? t.tour.resume : t.tour.pause}
        className="flex items-center gap-1 rounded-full bg-[var(--color-violet)] px-3 py-1 text-[11px] font-semibold text-[var(--color-on-accent)] shadow-sm shadow-[color-mix(in_srgb,var(--color-violet)_35%,transparent)] transition hover:opacity-90"
      >
        {paused ? "▶" : "⏸"} {paused ? t.tour.resume : t.tour.pause}
      </button>
      <button onClick={tourNextStep} title={t.tour.next} aria-label={t.tour.next} className={stepCls}>
        ▶
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
