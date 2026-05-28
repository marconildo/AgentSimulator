// 018-cumulative-hud: a compact running HUD near the conversation header — turns,
// total tokens, total cost, tool calls and RAG hits, growing turn by turn. The
// numbers are REAL (re-derived from each saved turn's trace via useHud); when a
// turn's trace has been evicted from the bounded store the totals under-count and
// we say so (`partial`) rather than faking a number. The tokenizer in play is
// surfaced so learners grasp that token counts are model-specific.

import { Fragment } from "react";

import { useT } from "../i18n";
import { formatTokens, formatUsd } from "../lib/cost";
import { useHud } from "../store/useHud";

export function ConversationHud() {
  const t = useT();
  const c = useHud((s) => s.cumulative);

  // Nothing to account for yet (a fresh draft / first turn still running).
  if (c.turns === 0) return null;

  // 029-ttft-throughput: decompose the token total into input (prompt) vs output
  // (completion) — priced and sized differently — when there is usage to split.
  const tokenStat =
    c.totalTokens > 0
      ? `${formatTokens(c.totalTokens)} ${t.hud.tokens} (${formatTokens(c.promptTokens)} ${t.hud.tokensIn} · ${formatTokens(c.completionTokens)} ${t.hud.tokensOut})`
      : `${formatTokens(c.totalTokens)} ${t.hud.tokens}`;

  // Each stat is its own span so the jargon ones carry a one-line glossary
  // tooltip (e.g. what a "RAG hit" is) instead of being thrown undefined.
  const stats: { text: string; hint?: string }[] = [
    { text: `${c.turns} ${t.hud.turns}` },
    { text: tokenStat },
    { text: formatUsd(c.costUsd) },
    { text: `${c.toolCalls} ${t.hud.toolCalls}` },
    { text: `${c.ragHits} ${t.hud.ragHits}`, hint: t.glossary["RAG hits"] },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-[10.5px] text-[var(--color-muted)]">
      <span className="tabular-nums">
        {stats.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && "  ·  "}
            <span title={s.hint} className={s.hint ? "cursor-help" : undefined}>
              {s.text}
            </span>
          </Fragment>
        ))}
      </span>
      {c.partial && (
        <span className="text-[var(--color-warn)]" title={t.hud.estimate}>
          · {t.hud.partial}
        </span>
      )}
      <span
        title={t.glossary.tiktoken}
        className="ml-auto shrink-0 cursor-help font-mono text-[var(--color-faint)]"
      >
        {t.hud.tokenizer}
      </span>
    </div>
  );
}
