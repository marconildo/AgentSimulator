# Plan: Learn content enrichment & cloud-awareness

> The HOW. Respects every principle in `.specify/constitution.md`. No protocol change,
> no new Stage — this is Learn-page content + rendering only (constitution §1/§6 untouched).

## Approach

Extend the existing `{ en, pt }`-resolved content model in `frontend/src/learn/content.ts`
with three new optional translatable blocks (`how`, `options`, `links`) and a **cloud hook**,
then teach `TopicDetail.tsx` to render them — including a cloud block that reads the active
cloud from `useCloud`.

For the cloud block we use the **hybrid** strategy: a topic declares an optional
`cloudRef` (the id of an existing station / tier / boundary) so we can pull that element's
already-authored `clouds[cloud]` managed-service name straight from `stations.ts` — no
duplication — plus an optional hand-authored `cloud: { azure?, aws?, gcp? }` note for the few
topics where the cloud changes the picture in a way a service name alone doesn't capture. A
pure resolver `cloudContentFor(topic, cloud)` composes the two and returns `null` for
`generic`, which keeps AC3 testable without touching React.

Content stays a **pure module** (the same pattern as today): translatable fields are `Tr`,
resolved by `*For(lang)` builders cached per language, so the components keep consuming plain
strings. Adding fields is additive — existing topics keep working; the new fields are filled
in as part of this spec (AC2 requires `how` + `options` on every topic).

Alternative considered: a separate per-cloud prose block on *every* topic (richer, but huge
bilingual surface to maintain and mostly redundant with the canvas's existing cloud map).
Rejected in favor of hybrid (see spec clarify).

## Affected files

**Backend**
- _None._ This feature is frontend-content only; no schema, route, agent, RAG, MCP or DB change.

**Frontend**
- `frontend/src/learn/content.ts` — extend `Topic`/`TopicSrc` with `how`, `options`,
  `links`, `cloudRef`, `cloud`; add `cloudContentFor()`; resolve the new translatable fields
  in `resolveTopic`; **author** the enriched prose for all existing topics and add the new
  gap topics (see "New topics" below).
- `frontend/src/learn/TopicDetail.tsx` — render the new **How it works**, **Other options**,
  **Study links** blocks; subscribe to `useCloud` and render the cloud block via
  `cloudContentFor`.
- `frontend/src/i18n/strings.ts` — add `learn.howItWorks`, `learn.otherOptions`,
  `learn.studyLinks`, `learn.onCloud(label)` in `en` + `pt` (and the `Strings` interface).
- `frontend/src/learn/content.test.ts` — **new** test file (AC1, AC2, AC3, AC4, AC5).
- `frontend/src/i18n/strings.test.ts` — extend for the new chrome keys (AC6), mirroring the
  existing parity test.

## Content model changes (content.ts)

```ts
// resolved (public)
interface StudyLink { label: string; url: string }          // proper nouns — not translated
interface Topic {
  id; title; what; why; where?;
  how: string;                 // AC2 — how it works
  options: string;             // AC2 — other options / alternatives + trade-off
  links?: StudyLink[];         // AC5 — curated external refs (optional)
  cloudRef?: string;           // station|tier|boundary id to borrow clouds{} from
  cloud?: { azure?: string; aws?: string; gcp?: string };    // resolved per-lang note
}
// source side: how/options/cloud.* are `Tr`; links labels/urls are plain strings.
```

`cloudContentFor(topic, cloud, lang): { service?: string; note?: string } | null`
- `cloud === "generic"` → `null`.
- else look up `topic.cloudRef` across `stationByIdFor(lang)` / `tierByIdFor(lang)` /
  `boundaryFor(lang)` and read `cloudValue(meta, cloud)` for `service`; read `topic.cloud?.[cloud]`
  for `note`. Return `null` only if **both** are empty.

## New topics (closing the assessment gaps)

Enrich **all** existing topics with `how` + `options` (+ links where useful), and add these
new ones (each in en+pt, listed in AC1's pinned coverage set):

| section | new topic id | covers |
|---|---|---|
| software | `langgraph` | StateGraph nodes/edges, `_deps()` via `config["configurable"]`, `lru_cache`d graph |
| software | `pure-projection` | `deriveView(events, cursor)` — live & replay share one path |
| software | `state-management` | Zustand store (`useSimulator`) — events + cursor |
| software | `i18n-bilingual` | `{ en, pt }` model, `*For(lang)` builders, the §4 rule |
| genai | `openai-provider` | chat-completions + embeddings, the `LLMProvider` seam, OpenAI-only |
| genai | `token-cost` | token accounting & cost estimation (spec 011) |
| infra | `timeline-phases` | `STAGE_TO_PHASE` phase rail (spec 004) |
| infra | `maturity-ladder` | Simple→Intermediate→Advanced scenarios (spec 008) |
| infra | `health-checks` | `/api/health`, readiness, `has_key` |
| data | `trace-replay` | TraceStore + cursor-based step/replay debugging |
| viz (new section) | `react-flow` | `@xyflow/react` canvas |
| viz | `framer-motion` | animation of hops/tokens |
| viz | `tailwind` | Tailwind v4 via `@tailwindcss/vite`, theme tokens |

A new **"Frontend & Visualization"** section (`id: viz`) groups the visualization-library
topics so the AI-agent story in the other sections stays focused. `react-flow`,
`framer-motion`, `tailwind`, `state-management`, `pure-projection` live there.

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent` added or changed; `schemas.py` ↔ `events.ts`
untouched; no `readoutFor`/`renderDetail` case; no new entry in `STAGE_TO_STATION` or
`STAGE_TO_PHASE`. Topics only *reference* existing station/tier/boundary ids for their cloud
map (read-only).

## Data model changes

None. No Chroma or SQLite change.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `learn.howItWorks` | How it works | Como funciona |
| `learn.otherOptions` | Other options | Outras opções |
| `learn.studyLinks` | Study links | Para estudar |
| `learn.onCloud(label)` | `On ${label}` | `Em ${label}` |

All topic prose (`how`, `options`, `cloud` notes) and the new section's title/intro are
authored in both `en` and `pt` inside `content.ts`. Study-link labels/URLs are proper
nouns/addresses — kept plain (not translated), per the i18n convention.

## Cloud map (constitution §5)

No new tier/station/boundary, so no `clouds{}` entry to add. The cloud block **reuses** the
existing `clouds{}` maps already filled for every station/tier/boundary in `stations.ts` via
`cloudRef` + `cloudValue`. **n/a** for new elements.

## Test strategy (constitution §9 — TDD)

Vitest, co-located. New file `frontend/src/learn/content.test.ts`; extend
`frontend/src/i18n/strings.test.ts`. All run offline (no OpenAI key needed — pure content).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 coverage | pinned `REQUIRED_TOPIC_IDS` ⊆ keys of `allTopicsFor('en')` and `allTopicsFor('pt')` | `learn/content.test.ts` |
| AC2 enriched blocks | every topic in both langs has non-empty `how` and `options` | `learn/content.test.ts` |
| AC3 cloud-aware | `cloudContentFor(topic, 'azure'…)` non-empty & contains the `stations.ts` service name for a `cloudRef` topic; `'generic'` → `null` | `learn/content.test.ts` |
| AC4 bilingual parity | `sectionsFor('en')` vs `sectionsFor('pt')`: same section/topic ids+order, same link counts, all prose fields non-empty | `learn/content.test.ts` |
| AC5 links well-formed | every `links[].label` non-empty and `url` matches `^https://` | `learn/content.test.ts` |
| AC6 i18n chrome | `howItWorks`/`otherOptions`/`studyLinks`/`onCloud` present in `en` and `pt` | `i18n/strings.test.ts` |

`npm run build` (`tsc --noEmit`) enforces the model change end-to-end (TopicDetail must
handle the new fields). No render-level test is required beyond the type-check + the pure
resolver test, matching how the codebase tests content today.

## Risks / trade-offs

- **Authoring volume.** Enriching ~50 topics × 2 languages × 2 new prose fields is a lot of
  prose; accuracy matters more than length. Mitigate by grounding every `how`/`options` in
  the actual code (the content file already doubles as docs) and keeping blocks tight.
- **`cloudRef` drift.** If a referenced station/tier/boundary id is renamed, the cloud block
  silently loses its service name. Mitigate: AC1/AC3 tests resolve `cloudRef` against the
  live `stations.ts`, so a dangling ref fails the suite. (Add an explicit assertion that every
  `cloudRef` resolves.)
- **No behavior/protocol risk.** Single-instance, pipeline and event contract are untouched.
