// 019-inline-citations: a pure, deterministic provenance attributor. It links a
// sentence of the *settled* answer to the tool result or retrieved chunk it is
// genuinely grounded in, so the learner sees that a grounded claim has a
// traceable source — and that ungrounded text does not.
//
// **Honest by construction (§everything-is-real).** We never guess an
// attribution. A sentence cites a source only when they share a CONTIGUOUS
// significant n-gram of at least `MIN_NGRAM` words — long enough that incidental
// shared words don't trigger a link. When nothing clears that bar, the sentence
// carries no citation (the AC2 negative test pins this). The method is purely
// lexical and frontend-only: no event/protocol change, no model-declared
// citations (the model can paraphrase, or lie).

import type { TraceEvent } from "../types/events";

// The bar: a shared run of this many significant (non-stopword) words. 4 is long
// enough that unrelated prose effectively never collides, trading recall for
// honesty (better no chip than a fabricated one). A named, tunable constant.
export const MIN_NGRAM = 4;

export interface ToolSource {
  kind: "tool";
  id: string;
  tool: string;
  args: Record<string, unknown>;
  text: string; // the tool result — matched against, and shown on hover
}

export interface ChunkSource {
  kind: "chunk";
  id: string;
  source: string;
  score: number;
  text: string; // the chunk text — matched against, and shown on hover
}

export type CitationSource = ToolSource | ChunkSource;

export interface Citation {
  index: number; // 1-based marker shown as [n]; stable per distinct source
  source: CitationSource;
  matchLength: number; // shared contiguous significant-word run (for transparency)
}

export interface AnswerSegment {
  sentence: string;
  citation: Citation | null; // null = no defensible source link
}

export interface CitedAnswer {
  segments: AnswerSegment[]; // every sentence of the answer, in order
  citations: Citation[]; // distinct cited sources, in marker order
}

// A small bilingual (en + pt) stopword set so common connective words don't pad
// a shared run. The MIN_NGRAM bar is the real guard; this just sharpens it.
const STOPWORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "was",
  "were", "be", "been", "it", "its", "that", "this", "these", "those", "as",
  "for", "with", "by", "at", "from", "into", "can", "will", "would", "should",
  "but", "not", "no", "if", "then", "than", "so", "such", "which", "who", "what",
  // Portuguese
  "o", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "e", "ou", "em", "no", "na", "nos", "nas", "que", "se", "por", "para", "com",
  "ao", "aos", "à", "às", "é", "são", "foi", "ser", "como", "mais", "isso",
]);

/** Lowercase, drop punctuation + stopwords → significant word tokens. */
function significantTokens(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Length of the longest contiguous run of tokens common to `a` and `b`. */
function longestCommonRun(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  const dp = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0; // dp[i-1][j-1]
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > best) best = dp[j];
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  return best;
}

/** Count of distinct significant tokens shared (a secondary, tie-break signal). */
function sharedTokenCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  let n = 0;
  for (const t of new Set(a)) if (setB.has(t)) n += 1;
  return n;
}

// Split into sentences on terminal punctuation / newlines, keeping the text.
// Mid-stream splitting is unstable, so this runs on the settled answer only.
function splitSentences(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Extract the citable sources from a turn's trace (tool results + chunks). */
export function sourcesFromEvents(events: TraceEvent[]): CitationSource[] {
  const sources: CitationSource[] = [];
  let toolN = 0;
  let chunkN = 0;
  for (const ev of events) {
    if (ev.phase !== "end") continue;
    if (ev.stage === "mcp.call") {
      const result = typeof ev.data.result === "string" ? ev.data.result : "";
      if (!result) continue;
      sources.push({
        kind: "tool",
        id: `${String(ev.data.tool ?? "tool")}#${toolN++}`,
        tool: String(ev.data.tool ?? ""),
        args: (ev.data.args as Record<string, unknown> | undefined) ?? {},
        text: result,
      });
    } else if (ev.stage === "rag.retrieve") {
      const chunks =
        (ev.data.chunks as { text?: string; source?: string; score?: number }[] | undefined) ?? [];
      for (const c of chunks) {
        const text = typeof c.text === "string" ? c.text : "";
        if (!text) continue;
        sources.push({
          kind: "chunk",
          id: `${c.source ?? "chunk"}#${chunkN++}`,
          source: String(c.source ?? ""),
          score: typeof c.score === "number" ? c.score : 0,
          text,
        });
      }
    }
  }
  return sources;
}

/**
 * Map `(answer, sources)` to per-sentence citations under the deterministic
 * lexical rule. A sentence cites the source with the longest shared contiguous
 * significant n-gram (≥ `MIN_NGRAM`); ties break on the larger shared-token
 * count, then on source order (stable). No qualifying source ⇒ no citation.
 */
export function citations(answer: string, sources: CitationSource[]): CitedAnswer {
  const sourceTokens = sources.map((s) => significantTokens(s.text));
  const indexById = new Map<string, number>();
  const distinct: Citation[] = [];

  const segments: AnswerSegment[] = splitSentences(answer).map((sentence) => {
    const sTok = significantTokens(sentence);

    let bestIdx = -1;
    let bestRun = 0;
    let bestShared = 0;
    for (let i = 0; i < sources.length; i++) {
      const run = longestCommonRun(sTok, sourceTokens[i]);
      if (run < MIN_NGRAM) continue;
      const shared = sharedTokenCount(sTok, sourceTokens[i]);
      if (run > bestRun || (run === bestRun && shared > bestShared)) {
        bestIdx = i;
        bestRun = run;
        bestShared = shared;
      }
    }

    if (bestIdx === -1) return { sentence, citation: null };

    const source = sources[bestIdx];
    let index = indexById.get(source.id);
    if (index === undefined) {
      index = distinct.length + 1;
      indexById.set(source.id, index);
      distinct.push({ index, source, matchLength: bestRun });
    }
    return { sentence, citation: { index, source, matchLength: bestRun } };
  });

  return { segments, citations: distinct };
}
