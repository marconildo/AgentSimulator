// 087-chunk-overlap-highlight — a pure projection of the chunk texts (already in the
// 083 trace) into the leading overlap a chunk carries from the previous one.
//
// The overlap between two consecutive chunks is the longest suffix of the previous chunk
// that is also a prefix of the current one: for fixed windows that is exactly the configured
// `chunk_overlap`; for the recursive splitter it is the carried tail; for semantic/agentic
// (no overlap) it is ~0. The genuine carried tail is always a real match, so the result is at
// least the true overlap; the scan is capped so a pathological input can't blow up.

const MAX_SCAN = 1200; // overlap is bounded by the chunk_overlap max (1000) + slack.

/** Length of the longest suffix of `prev` that is a prefix of `cur` (the carried overlap).
 *  Returns 0 when there is no overlap or `prev` is empty/undefined (the first chunk). */
export function overlapPrefixLen(prev: string | undefined, cur: string): number {
  if (!prev || !cur) return 0;
  const max = Math.min(prev.length, cur.length, MAX_SCAN);
  for (let k = max; k > 0; k--) {
    if (prev.endsWith(cur.slice(0, k))) return k;
  }
  return 0;
}
