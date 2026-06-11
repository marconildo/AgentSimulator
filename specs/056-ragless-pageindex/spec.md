# Spec: RAGLESS retrieval (PageIndex) — a strategy toggle inside the RAG block

| | |
|---|---|
| **ID** | 056-ragless-pageindex |
| **Status** | **draft** → clarified → planned → in-progress → done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-11 |

> Second Intermediate-rung feature, building on 054 (the RAG block) and 055 (the
> score threshold). Adds a **second retrieval strategy** — reasoning-based
> "RAGLESS" navigation (PageIndex) — as a **toggle inside the RAG block** (Vector RAG
> ⇄ RAGLESS), so the learner can compare embedding-similarity retrieval against
> retrieval-by-reasoning on the same corpus. (User confirmed the toggle-inside-block UX.)

## Problem / motivation

The whole app teaches *one* way to retrieve: chunk → embed → vector similarity search.
But embeddings are not the only answer — a growing class of systems does **RAGLESS /
reasoning-based retrieval** (e.g. **PageIndex**): build a hierarchical **tree / table of
contents** of the documents and let the **LLM navigate** that tree by reasoning to find
the relevant section — **no chunking, no embeddings, no vector DB**. It trades a vector
index for model calls, and it shines when structure matters (long, well-organized docs)
and when "why was this section chosen?" needs to be an explainable reasoning trace, not a
cosine score. Showing both side-by-side is a strong teaching moment for *when each fits*.

## Goals

- A **per-conversation strategy toggle** inside the RAG block: **Vector RAG** (today's
  embed → search → rerank → retrieve) ⇄ **RAGLESS (PageIndex)**.
- A **real** RAGLESS path (constitution §3): build a real document tree from the corpus
  (markdown headings are a natural hierarchy), have the model **navigate** it by reasoning,
  and return the selected node(s)' text as the grounding context — no embeddings involved.
- The **RAG block drill-in shows the RAGLESS pipeline** when active: Tree build →
  Navigate (the model's reasoning path through the toc) → Select → Augmented.
- Keep **Vector RAG byte-for-byte** when the toggle is on "Vector RAG" (the default).

## Non-goals

- Replacing Vector RAG — RAGLESS is an *alternative*, selectable path, not a default.
- A production-grade PageIndex (caching the tree, incremental updates, huge corpora) —
  the educational version builds the tree over the small local corpus per session.
- Hybrid (run both and fuse) — comparing is by toggling, not blending (deferred).
- Changing the Simple rung (RAGLESS is an Intermediate-rung option).

## User-facing behavior

- The **RAG block** (Vector DB node "open RAG pipeline") gains a **strategy toggle**:
  `Vector RAG` (default) / `RAGLESS · PageIndex`. Per-conversation, like `top_k`.
- On **RAGLESS**, sending a message animates a *different* pipeline in the RAG panel:
  **① Document tree** (the corpus' table of contents) → **② Navigate** (the model walks
  the tree, reasoning which branch to open — shown as the navigation trace) → **③ Select**
  (the chosen node/section) → **④ Augmented** (that text → the prompt). No Embedding /
  vector-search / rerank cards (they belong to Vector RAG).
- The Inspector / drill-in shows the **real navigation reasoning** and the selected
  section, so "why this passage?" is an explainable path, not a score.
- All new prose ships **en + pt**; node names that are proper nouns (PageIndex) stay as-is.

## Acceptance criteria

1. **AC1 (toggle, request-only)** — A `retrieval_strategy` request input (`vector` |
   `ragless`) defaults to `vector`; omitting it reproduces 054/055 behavior byte-for-byte.
2. **AC2 (real RAGLESS path)** — With `retrieval_strategy=ragless`, a retrieval-triggering
   query builds a real document tree from the corpus and the model navigates it to select
   ≥1 section whose text becomes the grounding context — **with no embedding / vector
   search / rerank** events emitted on that turn.
3. **AC3 (new stages, protocol)** — The RAGLESS path emits its own `Stage`s (e.g.
   `rag.tree`, `rag.navigate`, `rag.select`), mirrored in `events.ts`, each mapped in
   `STAGE_TO_STATION` **and** `STAGE_TO_PHASE` (totality holds; `tsc` clean).
4. **AC4 (drill-in shows RAGLESS pipeline)** — When RAGLESS is active the RAG drill-in
   renders the Tree → Navigate → Select → Augmented stages (and not the vector cards);
   when Vector RAG is active it renders the 054 pipeline.
5. **AC5 (honest comparison)** — Switching strategy and re-asking the same question shows
   the two retrieval routes producing grounding from the same corpus by different means
   (structural assertion: vector path has `rag.search`; ragless path has `rag.navigate`).
6. **AC6 (Simple/Vector unchanged)** — `retrieval_strategy=vector` (the default) leaves the
   event sequence and grounding byte-for-byte with 054/055.
7. **AC7 (bilingual)** — All new user-facing strings exist in `en` and `pt`.

## Protocol / stage impact

- **New `Stage`s** for the RAGLESS path (names TBD at clarify; e.g. `rag.tree`,
  `rag.navigate`, `rag.select`). Mirror in `events.ts`; map in `STAGE_TO_STATION` +
  `STAGE_TO_PHASE`. **This is a feature → protocol change (§1).**
- New **request-only** `retrieval_strategy` enum on `ChatRequest` (like `scenario`).

## Open questions (clarify before planning)

- [ ] **Tree source.** Build the tree from markdown headings of the corpus files (natural,
      real) vs. an LLM-generated summary tree (PageIndex-style) vs. an actual `pageindex`
      library if one fits. Recommended start: headings-based tree over the local corpus
      (real, deterministic structure) + LLM navigation.
- [ ] **Navigation mechanism.** One LLM call that picks a path, vs. an iterative
      walk (open node → decide deeper/stop). The iterative walk is more faithful to
      PageIndex and more visual, but costs more model calls.
- [ ] **Where the toggle lives.** Inside the RAG drill-in panel (contextual) vs. Settings →
      Experiment (with top-k / threshold). User asked for "inside the RAG block".
- [ ] **Uploaded docs.** Does RAGLESS cover user-uploaded PDFs too, or corpus-only first?
- [ ] **Interaction with the reranker / threshold (055).** RAGLESS has no rerank stage —
      confirm the threshold slider simply doesn't apply on the RAGLESS path.

## Out of scope / deferred

- Hybrid (vector + RAGLESS fused).
- Tree caching / large-corpus performance.
- A persisted per-agent default strategy (it's a per-conversation toggle for now).
