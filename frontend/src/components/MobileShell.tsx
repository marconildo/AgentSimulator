// 063-mobile-demo-layout — the phone-only, single-pane layout for the DEMO build.
// Rendered only when `isDemo() && useIsMobile()` (see App); the live build and the
// demo at desktop width never mount this, so the three-column desktop layout is
// untouched.
//
// One of {Diagram, Chat, Inspector} shows at a time, flipped by a bottom tab bar.
// All three panes stay MOUNTED (inactive ones hidden via CSS) — unmounting the
// ChatPanel would re-run its init() → reset() and wipe the live canvas trace
// (same invariant the desktop SidePanel honors). Diagram is the default (canvas-
// first); selecting a station auto-switches to Inspector, mirroring desktop 013.

import { useEffect, useState, type ReactNode } from "react";

import { ChatIcon, InspectorIcon } from "./icons";
import { useT } from "../i18n";
import { useSimulator } from "../store/useSimulator";

type Pane = "canvas" | "chat" | "inspector";

function DiagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="6" height="5" rx="1" />
      <rect x="15" y="4" width="6" height="5" rx="1" />
      <rect x="9" y="15" width="6" height="5" rx="1" />
      <path d="M6 9v3h12V9M12 12v3" />
    </svg>
  );
}

export function MobileShell({
  chat,
  canvas,
  inspector,
  timeline,
}: {
  chat: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
}) {
  const t = useT();
  const selected = useSimulator((s) => s.selected);
  const [active, setActive] = useState<Pane>("canvas");

  // Tapping a station should reveal its data without a manual tab change (AC6),
  // matching the desktop behavior where selecting re-opens the Inspector (013).
  useEffect(() => {
    if (selected !== null) setActive("inspector");
  }, [selected]);

  // React Flow can't fitView a `display:none` pane (it has zero size). Nudge it to
  // re-measure when the Diagram tab becomes visible.
  useEffect(() => {
    if (active === "canvas" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("resize"));
    }
  }, [active]);

  const tabs: { id: Pane; label: string; icon: ReactNode }[] = [
    { id: "canvas", label: t.mobile.tab.canvas, icon: <DiagramIcon className="h-5 w-5" /> },
    { id: "chat", label: t.mobile.tab.chat, icon: <ChatIcon className="h-5 w-5" /> },
    { id: "inspector", label: t.mobile.tab.inspector, icon: <InspectorIcon className="h-5 w-5" /> },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          data-testid="pane-chat"
          className={active === "chat" ? "h-full" : "hidden"}
          aria-hidden={active !== "chat"}
        >
          {chat}
        </div>
        <div
          data-testid="pane-canvas"
          className={active === "canvas" ? "flex h-full flex-col" : "hidden"}
          aria-hidden={active !== "canvas"}
        >
          <div className="relative min-h-0 flex-1">{canvas}</div>
          {timeline}
        </div>
        <div
          data-testid="pane-inspector"
          className={active === "inspector" ? "h-full overflow-y-auto" : "hidden"}
          aria-hidden={active !== "inspector"}
        >
          {inspector}
        </div>
      </div>

      <nav
        role="tablist"
        aria-label={t.app.simulator}
        className="flex shrink-0 border-t border-[var(--color-line)] bg-[var(--color-panel)]"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
                isActive
                  ? "text-[var(--color-sky-soft)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
