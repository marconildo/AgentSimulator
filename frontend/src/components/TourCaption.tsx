// Guided-tour narration balloon (005-guided-tour → 014-tour-scripted). Instead of
// a faint caption pinned to the bottom of the canvas, the balloon is anchored next
// to the station the tour is narrating and points a connector at it, so attention
// is led from word to component. Still a pure projection: it reads the tour step
// from the store, the station geometry from `layout.ts` (the single geometry
// owner), and the live React Flow viewport transform to map flow → screen.
//
// It lives inside the shared <ReactFlowProvider> (see App.tsx) so `useViewport`
// reflects the same pan/zoom as the canvas. If geometry isn't ready yet it falls
// back to a bottom-centered balloon so narration is never lost.

import { useViewport } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useLang } from "../i18n";
import { computeLayout } from "../lib/layout";
import { phaseLabelsFor } from "../lib/phases";
import { useResolvedSelection } from "../lib/selection";
import { currentStep, isTouring, tourNarrationFor } from "../lib/tour";
import { useSimulator } from "../store/useSimulator";

const BALLOON_W = 300; // fixed width so anchoring math is stable across phases
const GAP = 16; // space between the node and the balloon
const PAD = 14; // keep the balloon this far inside the canvas edges

export function TourCaption() {
  const lang = useLang((s) => s.lang);
  const tour = useSimulator((s) => s.tour);
  const expanded = useSimulator((s) => s.expanded);
  const sel = useResolvedSelection();
  const { x: vx, y: vy, zoom } = useViewport();

  const containerRef = useRef<HTMLDivElement>(null);
  const balloonRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [balloonH, setBalloonH] = useState(0);

  const step = currentStep(tour);
  const visible = isTouring(tour) && step !== null;
  const station = step?.station ?? null;
  const phase = step?.phase;

  const narration = phase ? tourNarrationFor(lang)[phase] : "";
  const label = phase ? phaseLabelsFor(lang)[phase] : "";
  const position = step ? `${tour.index + 1}/${tour.steps.length}` : "";

  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const layout = useMemo(() => computeLayout(expandedSet, sel), [expandedSet, sel]);

  // Track the canvas size (for clamping the balloon inside it).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainer({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure the rendered balloon so it can be vertically centered on the node.
  useLayoutEffect(() => {
    if (balloonRef.current) setBalloonH(balloonRef.current.offsetHeight);
  }, [narration, container.w, container.h, zoom, vx, vy, station]);

  // Map the node's laid-out flow rect through the viewport, choose the side with
  // room, clamp inside the canvas, and aim the connector at the node's center.
  const anchor = useMemo(() => {
    if (!station || !layout.positions[station] || !container.w) return null;
    const pos = layout.positions[station];
    const sx = pos.x * zoom + vx;
    const sy = pos.y * zoom + vy;
    const sw = layout.widths[station] * zoom;
    const sh = layout.heights[station] * zoom;
    const nodeCenterY = sy + sh / 2;

    // The data / AI-Ops columns sit on the right (flow x ≥ ~1016) → place the
    // balloon to their left (into the central gap); the client/API/Agent columns
    // get it on their right. Flip if the preferred side overflows the canvas.
    let onRight = pos.x < 800;
    let left = onRight ? sx + sw + GAP : sx - GAP - BALLOON_W;
    if (onRight && left + BALLOON_W > container.w - PAD) {
      onRight = false;
      left = sx - GAP - BALLOON_W;
    } else if (!onRight && left < PAD) {
      onRight = true;
      left = sx + sw + GAP;
    }
    left = Math.max(PAD, Math.min(left, container.w - BALLOON_W - PAD));

    const bh = balloonH || 84;
    const top = Math.max(PAD, Math.min(nodeCenterY - bh / 2, container.h - bh - PAD));
    const caretY = Math.max(12, Math.min(nodeCenterY - top, bh - 12));
    return { left, top, onRight, caretY };
  }, [station, layout, container, zoom, vx, vy, balloonH]);

  // The connector — a solid violet triangle on the balloon edge facing the node.
  const caretStyle: React.CSSProperties | null = anchor
    ? {
        top: anchor.caretY - 7,
        borderTop: "7px solid transparent",
        borderBottom: "7px solid transparent",
        ...(anchor.onRight
          ? { left: -7, borderRight: "7px solid var(--color-violet)" }
          : { right: -7, borderLeft: "7px solid var(--color-violet)" }),
      }
    : null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <AnimatePresence>
        {visible && (
          <motion.div
            // Re-key per phase so each stop's balloon fades in fresh at its node.
            key={phase}
            ref={balloonRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="absolute"
            style={
              anchor
                ? { left: anchor.left, top: anchor.top, width: BALLOON_W }
                : { left: "50%", bottom: 16, transform: "translateX(-50%)", width: BALLOON_W }
            }
          >
            <div className="relative rounded-xl border border-[color-mix(in_srgb,var(--color-violet)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-panel)_95%,transparent)] px-4 py-3 shadow-xl shadow-[color-mix(in_srgb,var(--color-violet)_24%,transparent)] backdrop-blur">
              {caretStyle && <span aria-hidden className="absolute h-0 w-0" style={caretStyle} />}
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--color-violet)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-on-accent)]">
                  {label}
                </span>
                <span className="ml-auto tabular-nums font-mono text-[11px] text-[var(--color-muted)]">
                  {position}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-[var(--color-ink)]">{narration}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
