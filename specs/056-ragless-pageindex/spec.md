# Spec: RAGLESS retrieval (PageIndex) — a parallel comparison box below the RAG node

| | |
|---|---|
| **ID** | 056-ragless-pageindex |
| **Status** | draft → clarified → planned → in-progress → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-11 |

> Second Intermediate-rung feature, building on 054 (the RAG block) and 055 (the
> score threshold). Adds a **second retrieval strategy** — reasoning-based
> "RAGLESS" navigation (**PageIndex**) — as a **per-conversation config toggle**.
> When enabled, a **new box appears below the RAG node** and **both retrieval paths
> run on the same turn**, so the learner can compare embedding-similarity retrieval
> against retrieval-by-reasoning on the same corpus, side by side.

## Problem / motivation

The whole app teaches *one* way to retrieve: chunk → embed → vector similarity search.
But embeddings are not the only answer — a growing class of systems does **RAGLESS /
reasoning-based retrieval** (e.g. **PageIndex**): build a hierarchical **tree / table of
contents** of the documents and let the **LLM navigate** that tree by reasoning to find
the relevant section — **no chunking, no embeddings, no vector DB**. It trades a vector
index for model calls, and it shines when structure matters (long, well-organized docs)
and when "why was this section chosen?" needs to be an explainable reasoning trace, not a
cosine score. Showing both **running on the same query, side by side** is a strong
teaching moment for *when each fits*.

## Clarified decisions (2026-06-11, with the user)

- **D1 — UX: a separate box, not a toggle.** RAGLESS is a **config toggle** (enable/
  disable). When enabled, a **new station box ("RAGLESS · PageIndex") appears below the
  RAG node** in the data tier. Supersedes the original "toggle inside the RAG block" idea.
- **D2 — Both run simultaneously.** With RAGLESS enabled, a retrieval-triggering turn runs
  **both** the Vector RAG pipeline **and** the PageIndex pipeline, each animating its own
  box. (Supersedes the original "Hybrid is a non-goal" — they run side by side, but are
  *not* fused; see D3.)
- **D3 — Grounding: PageIndex replaces Vector RAG.** When enabled, the **grounding
  context handed to the model comes from PageIndex** (it is the source of truth for the
  answer). The Vector RAG path still runs and animates **for side-by-side display only** —
  its result does not reach the prompt that turn. (RAGLESS off → Vector RAG grounds, as today.)
- **D4 — Real PageIndex = heading tree + LLM navigation.** Build a **real hierarchical
  tree from the corpus's markdown headings** (a natural table of contents), **pre-indexed**
  at startup like the Chroma index. A single **LLM navigation call** (OpenAI) reasons over
  the tree and selects the relevant node(s); the selected sections' text is the grounding
  context. No embeddings, no vector search, no rerank. (Faithful PageIndex algorithm: tree
  + LLM tree-search, sourced from the real heading structure.)
- **D5 — Config scope: Intermediate-rung experiment toggle.** The toggle lives in
  **Settings → Experiment** (per-conversation, like `top_k` / `simulate_failure`) and is
  **only effective on the Intermediate rung** (where Vector RAG already executes). On the
  Simple rung it is a no-op and the box is hidden, so **Simple stays byte-for-byte**.

## Goals

- A **per-conversation `ragless` config toggle** (Settings → Experiment), Intermediate-only.
- A **new `pageindex` station** below the RAG node, visible only when the toggle is on.
- A **real** RAGLESS path (constitution §3): a real heading tree over the corpus, an LLM
  navigation call that selects node(s), the selected text as grounding context.
- The new box has its **own drill-in pipeline** (Tree → Navigate → Select → Augmented),
  mirroring the RAG block's panel but with PageIndex stages — no embedding / vector / rerank.
- **Both pipelines run and animate on the same turn** when enabled; PageIndex grounds.
- Keep everything **byte-for-byte** with 054/055 when the toggle is off (the default).

## Non-goals

- Replacing Vector RAG as the *default* — RAGLESS is opt-in; off is unchanged.
- Fusing the two results (a hybrid ranker) — they run side by side, PageIndex grounds (D3),
  there is no score-level fusion.
- A production-grade PageIndex (LLM-summarized tree, incremental updates, huge corpora,
  caching across processes) — the educational version builds a deterministic heading tree
  over the small local corpus and caches it in-process.
- Changing the Simple rung (RAGLESS is Intermediate-only, D5).
- RAGLESS over user-uploaded PDFs (corpus-only first; uploads stay Vector-RAG-only).

## User-facing behavior

- **Settings → Experiment** gains a **"RAGLESS (PageIndex)" toggle** (per-conversation).
  It is enabled only on the Intermediate rung (disabled + explained on Simple).
- With the toggle **on**, a **new box "RAGLESS · PageIndex"** appears in the data tier
  **below the RAG node**, with an inbound hop from the Agent mirroring the RAG hop.
- Sending a retrieval-triggering message animates **both** boxes: RAG runs its
  embed → search → (rerank) → retrieve pipeline; the new box runs **① Document tree**
  (the corpus' table of contents) → **② Navigate** (the model walks the tree, reasoning
  which branch to open — the navigation trace) → **③ Select** (the chosen node/section).
- The **grounding** the model answers from comes from PageIndex (D3); the RAG box's
  "Augmented" readout indicates its result was **not used this turn** (RAGLESS active).
- The new box has an **"open RAGLESS pipeline"** drill-in (anchored panel like the RAG one)
  showing Tree → Navigate → Select → Augmented, with the **real navigation reasoning** and
  the selected section — so "why this passage?" is an explainable path, not a score.
- All new prose ships **en + pt**; proper nouns (PageIndex) stay as-is in both languages.

## Acceptance criteria

1. **AC1 (toggle, request-only)** — A `ragless: bool` request input defaults to `false`;
   omitting it (or sending `false`) reproduces 054/055 behavior byte-for-byte.
2. **AC2 (Intermediate-only)** — `ragless=true` has effect **only** when `scenario=intermediate`;
   on `scenario=simple` it is a no-op (no PageIndex stages, byte-for-byte Simple).
3. **AC3 (real RAGLESS path)** — With `ragless=true` on Intermediate, a retrieval-triggering
   query builds a real heading tree from the corpus and an LLM navigation call selects ≥1
   node whose text becomes the **grounding context the model answers from** — with **no
   embedding inside the PageIndex path** (no pageindex.* emits a vector).
4. **AC4 (both run, PageIndex grounds — D2/D3)** — On that turn **both** `rag.*` (Vector,
   for display) **and** `pageindex.*` (grounding) stages are emitted; the observation fed
   to the model (the ToolMessage / grounding) is the **PageIndex** context, not the vector one.
5. **AC5 (new stages, protocol)** — The RAGLESS path emits its own `Stage`s
   (`pageindex.tree`, `pageindex.navigate`, `pageindex.select`), mirrored in `events.ts`,
   each mapped in `STAGE_TO_STATION` (→ `pageindex`) **and** `STAGE_TO_PHASE` (→ `retrieve`);
   totality holds, `tsc` clean.
6. **AC6 (new station + conditional box)** — A `pageindex` station exists in `stations.ts`
   (data tier, below `rag`), `scenarios: [intermediate, advanced]`, with an inbound hop from
   the agent. It is **hidden unless the `ragless` toggle is on** (a `showRagless` layout
   param), and the cloud map (azure/aws/gcp), `why`/`whatBreaks` (028 gate) and tag glossary
   entry are filled.
7. **AC7 (drill-in shows RAGLESS pipeline)** — The box's drill-in renders Tree → Navigate →
   Select → Augmented (a pure projection `derivePageIndexPipeline(events, cursor)`), each
   stage's live status following the cursor, with the real ToC tree, navigation reasoning
   and selected section.
8. **AC8 (Simple/off unchanged)** — `ragless=false` (default) leaves the event sequence and
   grounding byte-for-byte with 054/055; the box is hidden and no `pageindex.*` is emitted.
9. **AC9 (bilingual)** — All new user-facing strings exist in `en` and `pt`.

## Protocol / stage impact

- **New `Stage`s** for the RAGLESS path: `pageindex.tree`, `pageindex.navigate`,
  `pageindex.select`. Mirror in `events.ts`; map in `STAGE_TO_STATION` (→ `pageindex`) and
  `STAGE_TO_PHASE` (→ `retrieve`). Emitted **only** on the Intermediate branch with `ragless`.
  **This is a feature → protocol change (§1).**
- New **request-only** `ragless: bool` field on `ChatRequest` (default `false`), threaded
  through `run_agent` → `AgentState.ragless`. `GET /api/config` exposes `ragless_default`.

## Open questions

_All resolved (see Clarified decisions D1–D5)._ One implementation detail decided in `plan.md`:
single navigation LLM call (not an iterative node-by-node walk) for cost/determinism, while
still visualizing the tree + the chosen path.

## Out of scope / deferred

- Hybrid (vector + RAGLESS *fused* into one ranking).
- Tree caching across processes / large-corpus performance / LLM-summarized trees.
- A persisted per-agent default strategy (per-conversation toggle for now).
- RAGLESS over user-uploaded documents.
