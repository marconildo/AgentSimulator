// Inline-SVG icon set for the app chrome — replaces platform emoji (🧭 💬 🔍
// 📚 ⚠️ ⚙️ 🌙 ☀️) so the look is identical on every OS and inherits the theme
// via `currentColor`. Stroke weight is 1.75px throughout; caps/joins rounded so
// every glyph reads as part of one family. No hex literals (theme guard).

type IconProps = { className?: string };

// Brand mark — a partial orbit (the ReAct loop) circling a central node. Stroke
// keeps it light enough to sit next to the wordmark without shouting; the inner
// dot uses `fill="currentColor"` so it tracks the accent on hover.
export function Logo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <defs>
        <linearGradient id="as-logo-orbit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-sky-soft)" />
          <stop offset="100%" stopColor="var(--color-violet)" />
        </linearGradient>
      </defs>
      {/* outer orbit, broken arc — "agent loops, never closes" */}
      <path
        d="M 4 14 A 10 10 0 1 1 14 24"
        fill="none"
        stroke="url(#as-logo-orbit)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* trailing arrow tick */}
      <path
        d="M 11 21 L 14 24 L 11 27"
        fill="none"
        stroke="var(--color-violet)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* tool satellites — three dots at 12 / 4 / 8 o'clock */}
      <circle cx="14" cy="4.5" r="1.5" fill="var(--color-sky-soft)" />
      <circle cx="22.5" cy="18" r="1.4" fill="var(--color-violet-soft)" />
      <circle cx="6" cy="20" r="1.2" fill="var(--color-sky-soft)" opacity="0.7" />
      {/* central node — the agent itself */}
      <circle cx="14" cy="14" r="3.2" fill="currentColor" />
    </svg>
  );
}

// Chat panel (left rail). Speech bracket with a typing dot — implies a chat in
// progress, not a generic message.
export function ChatIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3v-3H6.5A2.5 2.5 0 0 1 4 14.5z" />
      <circle cx="9" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Inspector panel (right rail). Concentric corner-brackets — "the thing you're
// looking at, framed" — not a magnifier (the inspector doesn't search, it
// reveals what's already selected).
export function InspectorIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <path d="M20 8V5.5A1.5 1.5 0 0 0 18.5 4H16" />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20H8" />
      <path d="M20 16v2.5A1.5 1.5 0 0 1 18.5 20H16" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// "Learn" nav. An open book stylized as two leaves with a binding crease.
export function BookIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 5.5h6a2 2 0 0 1 2 2v11a1.5 1.5 0 0 0-1.5-1.5h-6.5z" />
      <path d="M20.5 5.5h-6a2 2 0 0 0-2 2v11a1.5 1.5 0 0 1 1.5-1.5h6.5z" />
      <path d="M12 7.5v11" />
    </svg>
  );
}

// Back-to-simulator nav (paired with BookIcon when on the Learn page). A neat
// chevron-arrow that reads as "return" without an emoji's heavy stroke.
export function BackIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 6l-6 6 6 6" />
      <path d="M8 12h12" />
    </svg>
  );
}

// Health banner (offline / missing key). Triangle alert.
export function WarnIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5 21 19.5H3z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Settings — a six-tooth gear, balanced (the platform ⚙️ varies wildly per OS).
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  );
}

// "Configure agent" header button — a robotic head with antenna and a single
// eye-circuit. Kept distinct from SettingsIcon (cog) so users read it as
// "configure THIS AGENT", not "platform settings". Strokes match the family
// (1.75 weight, rounded caps).
export function BrainIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* antenna */}
      <path d="M12 3v2.2" />
      <circle cx="12" cy="3" r="0.7" fill="currentColor" stroke="none" />
      {/* head */}
      <rect x="5" y="5.2" width="14" height="13" rx="3" />
      {/* eyes */}
      <circle cx="9.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      {/* mouth strip */}
      <path d="M9 15.2h6" />
    </svg>
  );
}

// Theme toggle — crescent moon (currently-light wants dark) ...
export function MoonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

// ... and the sun (currently-dark wants light).
export function SunIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M5 19l1.8-1.8M17.2 6.8L19 5" />
    </svg>
  );
}
