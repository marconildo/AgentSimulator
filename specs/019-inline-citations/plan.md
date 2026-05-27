# Plan: Inline citations / provenance in the answer

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md` —
> **citations must be honest** (§everything-is-real): no fabricated attribution.
> Frontend-only (deterministic lexical overlap); no backend, no protocol, no new `Stage`.

## Approach

A pure `citations(answer, sources)` function (in `frontend/src/lib/citations.ts`) splits
the answer into sentences and, per sentence, finds the **best-matching source by a
deterministic lexical rule**; a sentence cites a source **only** when the rule clears a
defined bar, otherwise it carries **no citation** (AC1/AC2).

**Lexical rule (deterministic, documented).** Normalize sentence and source text to
lowercase word tokens, drop stopwords/punctuation. A sentence cites a source when they
share a **contiguous significant n-gram of ≥ N words** (default N = 4) — long enough that
incidental common words don't trigger a match. Among qualifying sources, attribute the
one with the **longest shared n-gram** (ties → highest containment). Unrelated text
shares no long n-gram → no citation (the AC2 negative test pins this). The bar is a named
constant, tunable, and justified in the code.

**Sources** are extracted from the event log uniformly: tool results from `mcp.call` END
`data` (carry tool name + args for the hover) and retrieved chunks from `rag.retrieve`
END `data` (carry chunk source + score + snippet). Each `Citation` carries enough to
render the hover detail (AC3).

**Rendering.** In the Agent anatomy answer section, sentences render in order; a cited
sentence gets a trailing chip (`[1]`) whose hover shows the source detail (tool +
args / chunk source + score + snippet). Uncited sentences render plain. Args, chunk text
and proper nouns stay **verbatim** (not translated); only the chrome labels are
bilingual.

*Alternatives considered:* (b) backend-emitted provenance — rejected in clarify (touches
§1 + the model generates freely, so the backend would also be heuristic); (c)
model-declared citations — rejected (the model can lie; violates everything-is-real).
Rendering on the **settled** answer (Agent anatomy) rather than the streaming chat bubble
— sentence splitting is unstable mid-stream; live-bubble citations deferred.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/citations.ts` *(new)* — `Citation`, `CitationSource`,
  `citations(answer, sources)`, plus `sourcesFromEvents(events)` to extract tool/chunk
  sources. Pure.
- `frontend/src/lib/citations.test.ts` *(new)* — AC1 (positive link), AC2 (negative — no
  fabrication), AC3 (hover payload completeness).
- `frontend/src/components/AgentDetail.tsx` — render the answer sentence-by-sentence with
  citation chips + hover detail (the answer section).
- `frontend/src/i18n/strings.ts` — citation chrome labels (en + pt).

## Protocol changes (constitution §1)

None. Frontend-only; reads existing `mcp.call` / `rag.retrieve` event `data`.

## Data model changes

None.

## i18n strings (constitution §4)

Chrome only; tool args / chunk snippets / proper nouns stay verbatim.

| key / location | en | pt |
|---|---|---|
| `citation.fromTool` | from {tool} | de {tool} |
| `citation.fromChunk` | from retrieved chunk | de trecho recuperado |
| `citation.score` | score | score |
| `citation.none` | (no traceable source) | (sem fonte rastreável) |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `citations(answer, sources)` links a sentence to a source when the n-gram rule holds | `frontend/src/lib/citations.test.ts` |
| AC2 | a sentence with no qualifying overlap gets **no** citation (negative test) | `citations.test.ts` |
| AC3 | each citation carries the hover payload (source kind/id, args or score, snippet) | `citations.test.ts` |
| AC4 | citation chrome exists in en **and** pt; args/snippets verbatim | i18n parity test |

The chip rendering/hover is guarded by `tsc`/`npm run build` + manual verify.

## Risks / trade-offs

- **Coarseness.** Lexical overlap can miss a genuine grounding the model paraphrased
  heavily (false negative) — acceptable per "accuracy over coverage": better to show no
  chip than a fabricated one. The N-word bar trades recall for honesty.
- **Threshold tuning.** N is a named constant; the AC2 negative test guards against a too-
  loose bar producing spurious citations.
- **AgentDetail is a hot file (019/020/021).** Schedule the three in different waves; the
  pure `citations.ts` is conflict-free.
- **Streaming.** Citations render on the settled answer only; mid-stream sentence
  splitting is unstable (deferred).
