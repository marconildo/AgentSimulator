// 018-cumulative-hud: a compact running HUD near the conversation header — turns,
// total tokens, total cost, tool calls and RAG hits, growing turn by turn. The
// numbers are REAL (re-derived from each saved turn's trace via useHud); when a
// turn's trace has been evicted from the bounded store the totals under-count and
// we say so (`partial`) rather than faking a number. The tokenizer in play is
// surfaced so learners grasp that token counts are model-specific.

import { useT } from "../i18n";
import { formatTokens, formatUsd } from "../lib/cost";
import { useHud } from "../store/useHud";

export function ConversationHud() {
  const t = useT();
  const c = useHud((s) => s.cumulative);

  // Nothing to account for yet (a fresh draft / first turn still running).
  if (c.turns === 0) return null;

  const stats = [
    `${c.turns} ${t.hud.turns}`,
    `${formatTokens(c.totalTokens)} ${t.hud.tokens}`,
    formatUsd(c.costUsd),
    `${c.toolCalls} ${t.hud.toolCalls}`,
    `${c.ragHits} ${t.hud.ragHits}`,
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-[10.5px] text-[var(--color-muted)]">
      <span className="tabular-nums">{stats.join("  ·  ")}</span>
      {c.partial && (
        <span className="text-[var(--color-warn)]" title={t.hud.estimate}>
          · {t.hud.partial}
        </span>
      )}
      <span className="ml-auto shrink-0 font-mono text-[var(--color-faint)]">{t.hud.tokenizer}</span>
    </div>
  );
}
