// 018-cumulative-hud: the pre-send estimate. We encode the composed input with a
// REAL tokenizer (js-tiktoken, `o200k_base`) so the HUD can honestly label the
// count `tiktoken · o200k_base` — the lesson that token counts are model-specific,
// not chars/4. The ranks are sizeable, so js-tiktoken is `import()`-ed lazily
// (first estimate) to keep it out of the initial bundle. The number is an
// ESTIMATE: the real, billed prompt is assembled server-side and reported in the
// trace; this only gives a feel for "how big is the context / next turn" before
// sending.

export const TOKENIZER_LABEL = "tiktoken · o200k_base";

// Frontend mirror of backend/app/llm/pricing.py input rates (US$ per 1M input
// tokens) — a labeled teaching approximation for the pre-send cost hint only.
// Keyed by model so the estimate tracks the actually-running model (from
// /api/health); an unlisted model prices at 0 rather than guessing.
const INPUT_RATE_PER_1M: Record<string, number> = {
  "gpt-4o-mini": 0.15,
  "gpt-4o": 2.5,
  "gpt-4.1": 2.0,
  "gpt-4.1-mini": 0.4,
  "gpt-4.1-nano": 0.1,
};

/** ≈ US$ to send `promptTokens` as input to `model` (0 for an unknown model). */
export function estimateInputCostUsd(promptTokens: number, model: string | null): number {
  const rate = (model && INPUT_RATE_PER_1M[model]) || 0;
  return (promptTokens / 1_000_000) * rate;
}

// Resolve the encoder once and share the promise — the lazy `import()` keeps the
// ranks off the initial load and concurrent callers share a single load.
type Encoder = { encode: (text: string) => number[]; decode: (tokens: number[]) => string };
let encoderPromise: Promise<Encoder> | null = null;

function getEncoder(): Promise<Encoder> {
  if (!encoderPromise) {
    encoderPromise = import("js-tiktoken").then((m) => m.getEncoding("o200k_base"));
  }
  return encoderPromise;
}

/** ≈ token count of `text` via the lazily-loaded real tokenizer (0 if blank). */
export async function estimateTokens(text: string): Promise<number> {
  if (!text.trim()) return 0;
  const encoder = await getEncoder();
  return encoder.encode(text).length;
}

/**
 * The actual token PIECES `text` breaks into (real `o200k_base` BPE), capped at
 * `max` for display. Each id is decoded back to its substring so the Embedding
 * detail can show "text → tokens" honestly (not a whitespace split). Returns
 * `{ pieces, total }` so the caller can show "showing N of total".
 */
export async function tokenizePieces(
  text: string,
  max = 48,
): Promise<{ pieces: string[]; total: number }> {
  if (!text.trim()) return { pieces: [], total: 0 };
  const encoder = await getEncoder();
  const ids = encoder.encode(text);
  const pieces = ids.slice(0, max).map((id) => encoder.decode([id]));
  return { pieces, total: ids.length };
}
