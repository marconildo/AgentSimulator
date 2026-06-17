# Tasks: Intermediate preview tiles (light up the rung's tracks)

> Ordered TDD checklist. Each implement task is preceded by the failing test that
> drives it. **Frontend-only**, view-only previews — no backend, no `Stage`.

> **Done — all green.** `npm run build` (tsc) clean + **533 Vitest** pass. Visually
> verified via `scripts/shot-tracks.mjs`: Intermediate now shows `All · RAG Quality ·
> Agent Design` + the two tiles (Hybrid Search in the data column, Summarization under
> DeepAgents); `rag`/`agent` narrow correctly (each cluster's tile hides, the tier box
> shrinks); Advanced shows both tiles + 4 themes with no header overflow (cloud already
> hidden on rungs with tracks, per 059). Simple unchanged. One extra touch beyond the
> plan: the glossary-parity test required `HYBRID` + `MEMORY` glossary entries (en+pt).

## A. Tests first (red)

- [x] **T1 — AC1/AC2/AC4 (track.test.ts):** extend with the two new stations:
  `hybrid` (comingSoon, stages [], scenarios ⊇ {intermediate,advanced}, tracks
  ["rag"]) + `summarization` (… tracks ["agent"]); `tracksForScenario("intermediate")
  = ["rag","agent"]`; intermediate `track="rag"` ⇒ hybrid & ¬summarization, `"agent"`
  ⇒ inverse, `"all"` ⇒ both. **Update** advanced expectation:
  `tracksForScenario("advanced") = {rag,agent,aiops,security}` and add
  hybrid/summarization to the advanced cluster assertions. *(red)*
- [x] **T2 — AC3 (scenario.test.ts):** `visibleStationIdsFor("intermediate")` =
  Simple set ∪ `{hybrid,summarization}`; cumulative chain holds; **update** the
  `inter.size === simple.size` assertion to `simple.size + 2`. *(red)*
- [x] **T3 — AC7 (layout.test.ts):** on `intermediate`, `hybrid` laid out (y below the
  last data node) and `summarization` below the agent; on `advanced`,
  `summarization.y ≥` sub-agent row bottom (no overlap); services + agent tier boxes
  wrap them. *(red)*

## B. Implement (green)

- [x] **T4 — stations.ts (data):** extend `StationId` with `hybrid` + `summarization`;
  add the two `StationSrc` entries with full `{en,pt}` prose + `clouds` map (per the
  plan tables), `stages: []`, `comingSoon: true`, `scenarios:
  ["intermediate","advanced"]`, `tracks: ["rag"]`/`["agent"]`, tiers
  `services`/`agent`, accents `--color-ok`/`--color-pink`, icons 🔀/🗜️.
- [x] **T5 — layout.ts:** add both ids to `EXPANDED_H` (= `COLLAPSED_H`) + `TIER_OF`;
  add `hybrid` to the data column `members` (after `llm`); add the `summarization`
  hand-placement block (below the agent, below the sub-agent row when present).
- [x] **T6 — exhaustive switches:** add `hybrid` + `summarization` to the `readoutFor`
  preview group (FlowCanvas → `""`) and the `innerRows` preview group (StationNode →
  `[]`). `tsc` confirms exhaustiveness.

## C. Verify + close out

- [x] **T7 — gates:** `npm run build` (tsc) clean + `npm test` (Vitest) green; all new
  ACs covered.
- [x] **T8 — visual (Playwright `shot-tracks.mjs`, add an intermediate-rag/agent shot):**
  Intermediate now shows the track selector (`All · RAG Quality · Agent Design`) +
  the two tiles; `rag`/`agent` narrow correctly; Advanced shows both tiles + 4 themes
  with no header overflow (shorten segmented labels only if it overflows). Simple
  unchanged.
- [x] **T9 — status + docs:** `spec.md` → done; flip the roadmap's Hybrid-search item
  to note it now has a preview tile (🟡 tile, was "no dedicated tile yet"); add a
  Summarization roadmap line under Intermediate/Agent if missing; update `MEMORY.md`.

## Definition of done

- [x] Every AC (1–8) maps to a passing test
- [x] `npm run build` + `npm test` green (533 Vitest)
- [x] No backend/protocol change — `events.ts`/`schemas.py` untouched; `Stage` still
  total over `STAGE_TO_STATION`/`STAGE_TO_PHASE`
- [x] Both new stations ship en + pt + full `clouds` map (§4/§5)
- [x] `simple` byte-for-byte under every track; Intermediate selector lights up
- [x] `spec.md` status → done
