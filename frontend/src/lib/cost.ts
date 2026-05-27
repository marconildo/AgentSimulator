// 011-token-cost — formatting for token counts and US$ cost. These are figures,
// not translatable prose, so they live here (used by the LLM readout / inspector).

/** Compact token count: 1234 → "1.2k", 12345 → "12k", 950 → "950". */
export function formatTokens(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** US$ cost with enough precision for sub-cent agent runs. */
export function formatUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n < 0.0001) return "<$0.0001";
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
