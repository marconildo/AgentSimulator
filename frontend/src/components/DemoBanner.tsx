// 058-online-demo-mode — a slim, dismissible-free banner shown only in the
// backend-less GitHub Pages showcase build. It tells the visitor this is a demo
// (sample questions only) and links to GitHub for the full, key-required tool.

import { useT } from "../i18n";
import { DEMO_REPO_URL, isDemo } from "../lib/demo";

export function DemoBanner() {
  const t = useT();
  if (!isDemo()) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-sky)_16%,var(--color-panel))] px-4 py-1.5 text-center text-[12px] text-[var(--color-ink)]">
      <span aria-hidden>🔵</span>
      <span className="text-[var(--color-text-soft)]">{t.demo.bannerLead}</span>
      <a
        href={DEMO_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[var(--color-sky-soft)] underline-offset-2 hover:underline"
      >
        {t.demo.bannerCta} →
      </a>
    </div>
  );
}
