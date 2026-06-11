# Spec: Rerank score threshold (minimum-relevance filter)

| | |
|---|---|
| **ID** | 055-rerank-score-threshold |
| **Status** | ~~draft → clarified → planned → in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-11 |

> Builds on 054 (the Intermediate reranker). A RAG-quality knob: drop chunks the
> reranker scored below a threshold so clearly-irrelevant passages never reach the
> prompt. Request-only (like `top_k`); no new `Stage`.

## Problem / motivation

On the Intermediate rung the reranker keeps the **top-k** candidates — *by rank
alone*. So a barely-relevant chunk gets kept just to fill `k` (observed: `embeddings.md`
kept at rank #4 with a cross-encoder score of **0.000**). Stuffing an irrelevant chunk
into the prompt adds **noise** and can mislead the LLM. Production RAG guards against
this with a **minimum-relevance threshold**: return the top-k chunks that *also* clear
a score cutoff — returning **fewer** (even zero) rather than padding with junk. This is
*precision over recall* for the final grounding context, and it **raises** answer
quality, it doesn't lower it.

## Goals

- A **minimum rerank-score threshold**: after reranking + trimming to `top_k`, drop
  any kept chunk whose cross-encoder score is **below the threshold**; the survivors
  are the grounding context (may be fewer than `top_k`, possibly zero).
- A **tunable slider** in the UI (per-conversation, like `top_k`), so the learner can
  watch a chunk fall out of the context as they raise the bar.
- The Rerank stage **shows which chunks were dropped** by the threshold ("below
  threshold") vs kept — so the *why* is visible.
- **Opt-in / safe default**: threshold `0` = today's behavior, byte-for-byte (no chunk
  is ever dropped at 0, since scores are ≥ 0).

## Non-goals

- A retrieval-time (cosine-similarity) threshold before the reranker — the cross-encoder
  score is the better relevance signal; a pre-rerank cosine cutoff is deferred.
- Changing the Simple rung (it has no reranker, so no threshold applies).
- Auto-tuning / per-query adaptive thresholds.
- Making the agent *abstain* with a special message when 0 chunks survive — it simply
  proceeds with no grounding (the existing ungrounded path); a dedicated "insufficient
  context" abstention is its own future spec.

## User-facing behavior

- **Settings → Experiment** gains a **"Rerank score threshold"** slider (0…1, step
  0.05) next to `top_k`. Default `0` (no filtering). Per-conversation (like `top_k`).
- On the next run, the **Rerank** stage of the RAG pipeline marks each candidate:
  **KEPT** (in top-k *and* score ≥ threshold) or **below threshold** (in top-k but
  score < threshold, so dropped). The **Retrieval** stage's "top N kept" count reflects
  the post-threshold survivors.
- The dropped chunks do **not** appear in the **Augmented** context.
- All new text ships **en + pt**.

## Acceptance criteria

1. **AC1 (request field)** — `ChatRequest.rerank_threshold` is an optional float bounded
   `0..1`; out-of-range is a 422. `None` (omitted) and `0` both mean "no filtering" and
   reproduce 054 behavior exactly.
2. **AC2 (filter applied)** — On `scenario=intermediate` with a threshold `t > 0`, the
   chunks handed to the prompt are exactly `{c in top_k : c.rerank_score ≥ t}` — i.e. a
   kept chunk with score `< t` is removed from the grounding context (and from the
   `rag.retrieve` chunks). With `t = 0`, the kept set is the full top_k (unchanged).
3. **AC3 (all below ⇒ empty)** — If every top_k chunk scores below the threshold, the
   grounding context is empty and the run still completes (no crash; the agent answers
   without retrieved grounding).
4. **AC4 (trace surfaces it)** — The `rag.rerank` END `data` carries the `threshold` and
   each candidate's kept/dropped status (additive keys; **no new `Stage`**).
5. **AC5 (slider + config)** — `GET /api/config` exposes the default threshold + bounds;
   a per-conversation slider sends `rerank_threshold`; omitting/zeroing it sends nothing
   extra (today's behavior).
6. **AC6 (rerank stage shows drops)** — The Rerank drill-in marks below-threshold
   candidates distinctly ("below threshold") instead of KEPT, and the Retrieval "kept"
   count reflects the survivors.
7. **AC7 (Simple unchanged)** — On `scenario=simple` the threshold is never applied (no
   reranker); the stage list + grounding are byte-for-byte with today.
8. **AC8 (bilingual)** — Every new user-facing string exists in `en` and `pt`.

## Protocol / stage impact

- **No new `Stage`.** Additive `data` keys on the existing `rag.rerank` END
  (`threshold`, per-candidate kept flag).
- New **request-only** field `ChatRequest.rerank_threshold` (mirrors `top_k`); not a
  `TraceEvent` field. No `events.ts` Stage change.

## Open questions (clarify before planning)

- [x] **Where + how** → resolved 2026-06-11: threshold on the **rerank score**, applied
      **after** rerank, exposed as a **tunable slider** in Settings → Experiment.
- [ ] **Default value** → `0` (opt-in, keeps byte-for-byte). Confirm we don't want a
      conservative non-zero default that would change grounding out of the box.
- [ ] **Slider step / range** → `0..1`, step `0.05` (FlashRank scores observed in 0..1).

## Out of scope / deferred

- Cosine-similarity (retrieval-time) threshold.
- An explicit "insufficient context" abstention path when 0 chunks survive.
- Exposing the threshold as a per-agent persisted setting (it's a per-conversation knob).
