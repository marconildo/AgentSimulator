# Spec: Chunking strategy explainers in Settings

| | |
|---|---|
| **ID** | 082-chunking-explainers |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-20 |

> Fill the WHAT and the WHY. **No implementation detail here.**

## Problem / motivation

This is a teaching platform, but the **Knowledge base → Chunking strategy** picker
(Settings) offers four strategies — Fixed, Recursive, **Semantic**, **Agentic** —
with no explanation of how each one actually splits a document. Semantic and
Agentic especially are opaque: a learner picks one without understanding what it
does or why it would differ from the default. A rich live **Chunking playground**
already exists, but it is buried in the Vector DB drill-in (`RagStageDetail`), far
from where the strategy is chosen, and it is framed as a fixed-vs-chosen
comparison, not a per-method "how it works."

Close the gap **where the choice is made**: when a strategy is selected in
Settings, show *how it works* and a *real* visual example of the boundaries it
produces.

## Goals

- For each of the four strategies, show a clear, bilingual **"how it works"**
  explanation **inline in the Settings Knowledge base section**, updating as the
  selected strategy changes.
- Show a **real visual example** of the *selected* strategy: the actual chunks it
  produces on a sample document, via the existing real `chunk-preview` endpoint
  (no fakery — §3).
- Reuse the existing chunk-preview infrastructure and per-strategy copy rather
  than duplicating it; offer a link to the full Vector DB Chunking playground for
  the side-by-side comparison.

## Non-goals

- No change to the chunking logic, the `chunk-preview` endpoint, or any `Stage` /
  protocol (the backend is already real and sufficient).
- Not a new Learn page (the explanation lives at the point of selection).
- Not removing or replacing the Vector DB Chunking playground — this complements it.

## User-facing behavior

- In **Settings → 📚 Knowledge base**, below the strategy radio + parameters, a
  **"How it works"** panel renders for the currently selected strategy:
  - A short bilingual explanation specific to that strategy (Fixed cuts blind
    fixed-size windows; Recursive packs paragraphs with overlap; Semantic groups
    sentences by embedding similarity, splitting on topic shifts; Agentic asks the
    LLM to segment by topic).
  - A **live example**: the real chunks the selected strategy yields on a sample
    document (each chunk a block, with its char count; mid-sentence cuts flagged),
    fetched from `/api/rag/chunk-preview`.
- Selecting a different strategy updates both the explanation and the live example.
- **Semantic/Agentic** call OpenAI; with no key the example shows the **honest
  error** the endpoint returns (no fabricated chunks) — same behavior as the
  existing playground.
- A link/button opens the full **Vector DB Chunking playground** (fixed-vs-chosen
  side-by-side) for deeper comparison.
- All new prose ships in **en + pt**.

## Acceptance criteria

1. **AC1** — In Settings, selecting each strategy (Fixed/Recursive/Semantic/
   Agentic) renders a *distinct*, non-empty explanation for that strategy; the
   text changes when the selection changes.
2. **AC2** — Settings shows a live chunk-preview example of the **selected**
   strategy, sourced from the real `/api/rag/chunk-preview` endpoint (the same
   data the Vector DB playground uses), rendering each chunk with its char count.
3. **AC3** — When the endpoint returns a per-strategy `error` (e.g. Semantic/
   Agentic with no key), the example shows that honest error and **no** fabricated
   chunks.
4. **AC4** — ~~A control opens the Vector DB Chunking playground.~~ **Revised
   (2026-06-20 follow-up):** the "see full comparison" link was **removed** — the
   Vector DB drill-in only mounts on the sim canvas, so from the Settings page the
   link did nothing. Instead, the in-place example must make the boundary honest:
   each chunk shows its **real ending** (not just the `line-clamp` ellipsis) and
   **mid-sentence cuts are flagged for every strategy**, so a learner sees that
   Recursive ends on a clean boundary while Fixed cuts mid-word — the comparison
   point, in place, without navigation.
5. **AC5** — Every new user-facing string exists in both `en` and `pt`.
6. **AC6** — No `Stage` / protocol / chunking-logic change: omitting this feature
   leaves the rest of the app byte-for-byte unchanged (additive UI only).

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to: **n/a** (Settings UI; reuses the `chunk-preview` endpoint).

## Open questions (clarify before planning)

- [x] Where does it live? → **Inline in Settings**, per selected strategy, with a
  link to the Vector DB playground (user choice, 2026-06-20).
- [x] Static schematic vs live preview? → **Live real chunk-preview** (user choice).

## Out of scope / deferred

- A static conceptual diagram per method (the "both" option) — parked; the live
  real preview was chosen.
- A dedicated Learn topic for chunking strategies.
