// Small, pure time formatters for the chat UI. Backend timestamps are Unix
// *seconds* (Python time.time()); the browser's Date wants milliseconds, so we
// normalize first. Formatting keys off the active language so the clock and
// relative strings read naturally in both en and pt with no hand-written maps.

import type { Lang } from "../i18n";

const LOCALE: Record<Lang, string> = { en: "en-US", pt: "pt-BR" };

/** Normalize a timestamp to milliseconds, tolerating seconds-since-epoch. */
export function toMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

/** "14:32" — a short wall-clock time for a message, in the active locale. */
export function formatClock(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(toMs(ts));
}

/**
 * A stage's latency for a chip. The backend rounds to one decimal, so a fast
 * stage arrives as 0.0–0.9 ms; rendering that as "0 ms" reads like a bug (B4),
 * so anything under a millisecond floors to "<1 ms". Everything else is whole
 * milliseconds.
 */
export function formatLatency(ms: number): string {
  if (ms < 1) return "<1 ms";
  return `${Math.round(ms)} ms`;
}

// Coarse buckets, smallest first; each `amount` is how many of `unit` fit into
// the next bucket up. We walk up until the remaining duration fits a bucket.
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** "2 min ago" / "há 2 min" — coarse relative time for the session list. */
export function formatRelative(ts: number, lang: Lang, now: number = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  let duration = (toMs(ts) - now) / 1000; // seconds; negative for the past
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return rtf.format(Math.round(duration), "year");
}
