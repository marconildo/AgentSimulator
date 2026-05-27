# Spec: Inline citations / provenance in the answer

| | |
|---|---|
| **ID** | 019-inline-citations |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

When the agent grounds its answer in a tool result (`kb_lookup → "…grounds an LLM in
retrieved documents"`) or a retrieved chunk, the relationship **answer ↔ source** is
left implicit. Marking the grounded span with a small citation chip (`[1]`, hover →
"from kb_lookup · topic=RAG · '…'") teaches **grounding** and **provenance** viscerally
— two of the concepts the assessment says the Simple scenario is missing.

**Constitution guardrail (§everything-is-real):** citations must be **honest**. We never
fabricate an attribution; if a link can't be established defensibly, we show none.

## Goals

- Attach **provenance chips** to the parts of the answer that are genuinely grounded in
  a specific tool result or retrieved chunk, viewable on hover.
- Teach that a grounded claim has a traceable source — and that ungrounded text doesn't.

## Non-goals

- No fabricated or guessed citations — accuracy over coverage.
- Not a full RAG-attribution research feature; a defensible, simple linking rule.

## User-facing behavior

- Where the answer reflects a source, an inline marker links to that source; hovering
  shows the source detail (tool name + args / chunk source + score + snippet).
- Where nothing can be honestly linked, **no marker** is shown.
- Source prose (labels) is bilingual; tool args, chunk text and proper nouns stay
  verbatim.

## Acceptance criteria

1. **AC1** — A pure function maps `(answer, sources)` to a set of citations, where each
   citation links a span/segment of the answer to a source **only when a defined,
   deterministic link rule holds** (see Open questions for the rule).
2. **AC2** — When the rule finds no defensible link for a segment, the function emits
   **no citation** for it (no fabrication) — proven by a negative test.
3. **AC3** — Each emitted citation carries enough to render the hover detail (source
   id/kind, args or score, snippet) and renders without breaking the answer text.
4. **AC4** — Citation label/prose exists in **both en and pt**; args/snippets verbatim.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a** — the lexical method is **frontend
  only**; no event/`data` change, no backend.
- Station it maps to in `stations.ts`: **n/a**

## Clarified (2026-05-27)

- [x] **Attribution method** → **(a) deterministic lexical overlap**, frontend-only.
  A sentence cites a source only when a defined shared-text rule holds; honest by
  construction (no fabrication — AC2 negative test). Keeps 019 off the backend/protocol.
- [x] **Granularity** → **sentence-level.** The answer is split into sentences; each
  sentence may carry at most one citation (its best-matching source).
- [x] **Sources in scope** → **both** — tool results (`mcp.call` data) **and** retrieved
  chunks (`rag.retrieve` data). The lexical rule runs uniformly over any source text.

## Out of scope / deferred

- Confidence scoring of a citation.
- Click-through that opens the full source document.
