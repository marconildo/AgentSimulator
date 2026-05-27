# Tasks: Learn content enrichment & cloud-awareness

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the test
> that should fail first (red → green → refactor). Check boxes as you go. All tests are
> Vitest, run offline (pure content — no OpenAI key needed).

## Tasks

### Model + resolver (the seam everything else builds on)

- [x] **T1 — test first (AC3)**: in `frontend/src/learn/content.test.ts`, write failing tests
  for `cloudContentFor(topic, cloud, lang)`: `generic` → `null`; for a topic with a
  `cloudRef`, `azure`/`aws`/`gcp` return content whose `service` equals
  `cloudValue(stationByIdFor(lang)[ref], cloud)`; every `cloudRef` in the data resolves to a
  real station/tier/boundary.
- [x] **T2 — implement**: extend `Topic`/`TopicSrc` in `content.ts` with `how`, `options`,
  `links`, `cloudRef`, `cloud`; resolve the new `Tr` fields in `resolveTopic`; add
  `cloudContentFor()`. Make T1 green. (`tsc` will now flag `TopicDetail` — fixed in T9/T10.)

### Coverage + enrichment of content (the bulk of the prose)

- [x] **T3 — test first (AC1)**: write failing test pinning `REQUIRED_TOPIC_IDS` (the
  assessment list incl. new gaps: `langgraph`, `pure-projection`, `state-management`,
  `i18n-bilingual`, `openai-provider`, `token-cost`, `timeline-phases`, `maturity-ladder`,
  `health-checks`, `trace-replay`, `react-flow`, `framer-motion`, `tailwind`) ⊆ keys of
  `allTopicsFor('en')` **and** `allTopicsFor('pt')`.
- [x] **T4 — implement**: add the new `viz` ("Frontend & Visualization") section and all new
  topics across `software` / `genai` / `infra` / `data` / `viz`, en+pt. Make T3 green.
- [x] **T5 — test first (AC2)**: write failing test asserting every topic in both languages
  has non-empty `how` and non-empty `options`.
- [x] **T6 — implement**: author `how` + `options` (en+pt) for **every** topic — existing and
  new. Add `links` and `cloud`/`cloudRef` where they add value. Make T5 green.

### Parity + link hygiene

- [x] **T7 — test first (AC4 + AC5)**: write failing tests — `sectionsFor('en')` vs
  `sectionsFor('pt')` have identical section ids, identical topic ids in order, equal
  `links` count per topic, and all prose fields non-empty in both langs; every `links[]` has a
  non-empty label and `^https://` url.
- [x] **T8 — implement**: fix any parity/link gaps surfaced by T7. Make it green.

### Rendering

- [x] **T9 — i18n (AC6)**: add `learn.howItWorks` / `otherOptions` / `studyLinks` /
  `onCloud(label)` to the `Strings` interface and both `en` + `pt` in `strings.ts`; extend
  `i18n/strings.test.ts` parity test to require them (red → green).
- [x] **T10 — implement render**: in `TopicDetail.tsx` render **How it works**, **Other
  options**, **Study links** blocks; subscribe to `useCloud` and render the cloud block via
  `cloudContentFor` (titled `t.learn.onCloud(activeCloudLabel)`), hidden when `null`. Keep
  `tsc --noEmit` clean.
- [x] **T11 — refactor**: tighten prose, dedupe, ensure links open in a new tab safely
  (`rel="noopener noreferrer"`), keep all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC6)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change — `schemas.py` ↔ `events.ts` untouched; `STAGE_TO_STATION` /
  `STAGE_TO_PHASE` unchanged; no new canvas station/tier/hop
- [x] All new user-facing text exists in en **and** pt (topics, section, chrome strings)
- [x] Every `cloudRef` resolves against `stations.ts`; cloud block hidden on Generic
- [x] `spec.md` status updated to `done`
