# Spec: Learn content enrichment & cloud-awareness

| | |
|---|---|
| **ID** | 023-learn-content-enrichment |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The Learn page is the project's self-documentation: a roadmap.sh-style map that explains
every technology and concept the visualizer uses. Today each topic is shallow — only
**What it is**, **Why it's used here**, and **In the project** — which is enough to name a
thing but not enough to *study* it. Three gaps:

1. **No depth.** A learner reads "embeddings capture meaning" and "RAG grounds answers"
   but never learns *how* either actually works, or *what other options exist* (Pinecone vs.
   Chroma, WebSockets vs. SSE, BM25 vs. dense). The page tells; it doesn't teach.
2. **Incomplete coverage.** Several technologies the project genuinely uses — or
   demonstrates on the canvas — have **no Learn topic at all**: the frontend/visualization
   stack (Zustand, React Flow, Framer Motion, Tailwind, the pure-projection `deriveView`
   pattern), the numeric/timeline features (token cost, timeline phases, trace replay), and
   cross-cutting concepts (i18n/bilingual design, the Simple→Intermediate→Advanced maturity
   ladder, health checks). The promise — "every technology and concept has a topic" — is
   not yet kept.
3. **Cloud-blind.** The app has a cloud toggle (Generic / Azure / AWS / GCP) that already
   rewrites the canvas labels, but the **Learn page ignores it entirely**. A learner who
   selects Azure to study "how would I run this on Azure?" gets nothing extra on Learn,
   even though `stations.ts` already knows the per-cloud managed service for every node.

This matters because Learn is the portfolio's teaching surface: it should stand on its own
as a study guide for building production AI agents, and it should reward the cloud toggle
the rest of the app honors.

## Goals

- Every technology and concept used in the project **or** demonstrated on the canvas has a
  Learn topic — the assessment gaps above are closed.
- Each topic gains studyable depth: **How it works** (the mechanism), **Other options**
  (alternative tools/approaches and the trade-off), and **Study links** (curated external
  references), on top of today's What / Why / In the project.
- When a cloud is selected, relevant topics surface **that cloud's resources**: the concrete
  managed-service name (reused from the model the canvas already uses) plus a short authored
  note where it adds value. Selecting Generic shows no cloud block (today's behavior).
- All new prose ships in **English and Portuguese** (constitution §4).

## Non-goals

- **No change to the event protocol, no new `Stage`/`Phase`/`TraceEvent`, no new canvas
  station/tier/hop.** This is Learn-page content only; the simulator pipeline is untouched.
- Not adding a per-topic quiz, search, or progress tracking — purely content + rendering.
- Not making the cloud notes exhaustive cloud docs; a short, accurate orientation per cloud,
  leaning on the existing `clouds{}` service map, is the bar.
- Not authoring a separate offline reading corpus; Study links point to external docs.

## User-facing behavior

On the Learn page, opening any topic shows, below the existing **What it is** / **Why it's
used here** / **In the project**:

- a **How it works** section — a deeper, study-grade explanation of the mechanism;
- an **Other options** section — alternatives and the trade-off (e.g. "Chroma here; Pinecone,
  Weaviate, pgvector or a managed vector search are common alternatives — managed services
  trade control for ops burden");
- a **Study links** list — curated external references (official docs, papers), opening in a
  new tab. Labels/URLs are proper nouns and stay un-translated.

When the header cloud toggle is **not** Generic, relevant topics additionally show a
**cloud block** titled for the active cloud (e.g. "On Azure" / "Em Azure") containing the
concrete managed-service name (e.g. *Azure OpenAI*) drawn from the same model the canvas
uses, plus a short authored note for that cloud when one exists. Switching the toggle back to
Generic hides the block. Topics with no cloud relevance never show the block.

New topics appear in the map and the section lists exactly like existing ones. The Learn map
keeps working with the larger topic set.

## Acceptance criteria

1. **AC1 — Coverage** — Given a documented assessment list of every technology/concept the
   project uses or demonstrates (including the new gap topics: frontend/visualization stack,
   pure-projection, token-cost, timeline-phases, trace-replay, i18n, maturity-ladder,
   health-check, LangGraph specifics, OpenAI-provider specifics), when the Learn content is
   built, then **each id in that list resolves to a topic** in `allTopicsFor(lang)` for both
   languages. The test pins the list, so removing a required topic fails.

2. **AC2 — Enriched blocks** — Given any Learn topic, when resolved in either language, then
   it has a **non-empty `how`** and a **non-empty `options`** field. (Study links are optional
   per topic.)

3. **AC3 — Cloud-aware content** — Given a topic that declares cloud relevance, when the
   active cloud is `azure`/`aws`/`gcp`, then the resolved cloud content is **non-empty and
   contains the managed-service name** that the shared visual model maps for that cloud; when
   the active cloud is `generic`, the resolved cloud content is **empty/absent**.

4. **AC4 — Bilingual parity (§4)** — Given the content built for `en` and for `pt`, then both
   have the **same section ids and the same topic ids in the same order**, the **same number
   of study links per topic**, and **every translatable prose field resolves to a non-empty
   string** in both languages (no en-only or pt-only field).

5. **AC5 — Study links well-formed** — Given any topic's study links, when present, then each
   entry has a **non-empty label** and an **absolute `https://` URL**.

6. **AC6 — i18n chrome (§4)** — Given the UI strings, then the new Learn block labels
   (How it works, Other options, Study links, and the cloud-block title) exist in **both**
   `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **none** (no new canvas node; Learn topics may
  *reference* existing station/tier/boundary ids to reuse their cloud map, but add no nodes)

## Open questions (clarify before planning)

_All resolved (clarified with the user 2026-05-27):_

- [x] Cloud mechanism → **Hybrid**: auto-surface the existing `stations.ts` `clouds{}`
  service name + a short hand-authored per-topic note where it adds value.
- [x] New blocks → **How it works + Other options + Study links** (all three).
- [x] New-topic scope → **All assessment gaps + enrich every existing topic** (including the
  frontend/visualization libraries).

## Out of scope / deferred

- Per-cloud notes for *every* topic — only where the cloud materially changes the picture.
- Search / filtering on the Learn map; deep-linking to a topic by URL.
- Turning Study links into an offline, version-pinned reading corpus.
