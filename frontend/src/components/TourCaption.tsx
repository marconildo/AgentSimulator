// Guided-tour caption bar (005-guided-tour). A bottom overlay on the canvas that
// narrates the current phase while the tour is running. Pure projection: it reads
// the tour phase from the store and resolves the caption from i18n strings, so it
// stays reactive to language. Renders nothing when no tour is active.

import { AnimatePresence, motion } from "framer-motion";

import { useLang } from "../i18n";
import { phaseLabelsFor } from "../lib/phases";
import { currentStep, isTouring, tourCaptionsFor } from "../lib/tour";
import { useSimulator } from "../store/useSimulator";

export function TourCaption() {
  const lang = useLang((s) => s.lang);
  const tour = useSimulator((s) => s.tour);

  const step = currentStep(tour);
  const visible = isTouring(tour) && step !== null;
  const phase = step?.phase;

  const label = phase ? phaseLabelsFor(lang)[phase] : "";
  const caption = phase ? tourCaptionsFor(lang)[phase] : "";
  const position = step ? `${tour.index + 1}/${tour.steps.length}` : "";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          // The phase key makes each phase slide in fresh as the tour advances.
          key={phase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4"
        >
          <div className="flex max-w-[680px] items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-violet)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-panel)_92%,transparent)] px-4 py-2.5 shadow-lg shadow-[color-mix(in_srgb,var(--color-violet)_18%,transparent)] backdrop-blur">
            <span className="rounded-full bg-[var(--color-violet)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-on-accent)]">
              {label}
            </span>
            <span className="text-[13px] leading-snug text-[var(--color-ink)]">{caption}</span>
            <span className="tabular-nums font-mono text-[11px] text-[var(--color-muted)]">
              {position}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
