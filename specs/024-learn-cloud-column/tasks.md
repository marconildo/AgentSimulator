# Tasks: Cloud-aware Learn map — "Build on {cloud}" column

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the test that
> should fail first (red → green → refactor). Check boxes as you go. All tests are Vitest, run
> offline (pure content/data — no OpenAI key needed).

## Tasks

### Resolver (the data seam everything else builds on)

- [x] **T1 — test first (AC1, AC2, AC3)**: create `frontend/src/learn/cloudColumn.test.ts` with
  failing tests for `cloudGuideFor(cloud, lang)`: `generic` → `[]`; for `azure`/`aws`/`gcp` ×
  `en`/`pt` every entry's `service === cloudValue(cloudElementFor(ref, lang), cloud)` & non-empty,
  every `ref` resolves to a station/tier/boundary, every `topicId` ∈ `allTopicsFor(lang)`; en vs
  pt parity (same length, same `topicId` order, non-empty `label`s).
- [x] **T2 — implement**: in `content.ts` add `CloudGuideEntry`, `CLOUD_GUIDE_SRC`, and
  `cloudGuideFor()` (reuse `cloudElementFor` + `cloudValue`; cache per cloud+lang). Make T1 green.

### Brand icons (chore folded in — the column header needs them)

- [x] **T3 — test first (AC5)**: extend `cloudColumn.test.ts` to assert `CLOUD_ICONS[c]` is
  defined and is a function (component) for every `CloudId`.
- [x] **T4 — implement**: add `frontend/src/lib/cloudIcons.tsx` (`GenericIcon`/`AzureIcon`/
  `AwsIcon`/`GcpIcon` inline SVG official marks, `CLOUD_ICONS` + `CLOUD_ACCENT`); drop the emoji
  `icon` from `CLOUDS` in `cloud.ts`; render `CLOUD_ICONS[code]` in `CloudToggle.tsx`. Green +
  `tsc` clean.

### Map column rendering

- [x] **T5 — test first (AC1, AC4)**: extend `cloudColumn.test.ts` with failing tests on the
  exported `buildGraph(selected, sections, cloud, lang)`: `"generic"` → no `cloud-col`/`cloud:*`
  nodes; non-generic → a `cloud-col` header node + exactly one `cloud:{topicId}` node per guide
  entry, ids namespaced (`cloud:` prefix), and the namespaced id maps back to a real `topicId`.
- [x] **T6 — implement**: in `LearnMap.tsx` make `buildGraph` cloud/lang-aware, pure & exported;
  subscribe to `useCloud`; register `lcloud`/`lcloudtopic` node types; map `cloud:*` clicks back
  to the topic id. In `LearnNodes.tsx` add `CloudSectionNode` + `CloudTopicNode`. Make T5 green.

### i18n chrome

- [x] **T7 — test first (AC6)**: add `learn.cloudGuideHint` to the `Strings` interface and extend
  `i18n/strings.test.ts` parity test to require it (red).
- [x] **T8 — implement**: add `learn.cloudGuideHint(label)` in `en` + `pt` in `strings.ts`; wire
  it into `CloudSectionNode`. Make T7 green.

### Verify + refactor

- [x] **T9 — refactor**: tighten the resolver/builder, keep all tests green, `ruff`/`tsc` clean.
- [x] **T10 — verify visuals**: `npm run build` + run the app; screenshot the cloud toggle and the
  Learn map with Azure/AWS/GCP selected; confirm brand icons read and the column appears/clears
  with the toggle. Swap AWS to the "smile" mark if the wordmark is illegible at toggle size.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC6)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change — `schemas.py` ↔ `events.ts` untouched; `STAGE_TO_STATION` /
  `STAGE_TO_PHASE` unchanged; no new canvas station/tier/hop
- [x] All new user-facing text exists in en **and** pt (layer labels + the hint string)
- [x] Every `ref`/`topicId` in `CLOUD_GUIDE_SRC` resolves against the live model; column hidden
  on Generic
- [x] Cloud toggle renders official brand marks (verified by screenshot)
- [x] `spec.md` status updated to `done`
