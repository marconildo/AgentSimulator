# Tasks: Scenario framework (maturity ladder)

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.
> `scenario` is request-only, so there is **no `schemas.py` ↔ `events.ts` mirror**.

## A. Backend seam (AC1, AC2)

- [x] **T1 — test first (AC1):** `backend/tests/test_scenario.py` — `ChatRequest(message=…, scenario="advanced")` parses; default is `simple`; an invalid value raises validation error; a `/api/chat` run with **no** `scenario` fires the same stages / activates the same stations as today (reuse the existing structural-assertion style). *(red ✓)*
- [x] **T2 — implement:** add `Scenario(StrEnum)` + `ChatRequest.scenario: Scenario = Scenario.SIMPLE` in `schemas.py`; thread it `chat()` → `run_agent(..., scenario=…)` → `AgentState["scenario"]` (carried, no node branching); echo `scenario` into `request_body`. *(green ✓)*
- [x] **T3 — test first (AC2):** extend `test_scenario.py` — `GET /api/config` returns a `scenarios` array; each item has `id`, `name.{en,pt}`, `blurb.{en,pt}`, and `available`/`coming_soon`; `simple.available is True`, the other two `coming_soon`. *(red ✓)*
- [x] **T4 — implement:** build the `scenarios` payload in `main.py` `/api/config`. *(green ✓)*

## B. Frontend store + send gating (AC5, AC4-send)

- [x] **T5 — test first (AC5):** `frontend/src/lib/scenario.test.ts` — `useScenario` defaults to `simple`, `setScenario` updates, persists to `localStorage`, is global (mirror `theme.test.ts`); `canSend("simple")===true`, `canSend("intermediate")===false`, `canSend("advanced")===false`. *(red ✓)*
- [x] **T6 — implement:** create `frontend/src/lib/scenario.ts` (`Scenario`, `SCENARIO_ORDER`, `useScenario`, `canSend`, `isScenario`). *(green ✓)*

## C. Scenario-scoped visual model (AC3, AC4, AC6)

- [x] **T7 — test first (AC3 + AC4 + AC6):** `scenario.test.ts` — `visibleStationIdsFor("simple")` equals today's 7 ids and `visibleHopsFor("simple")` only between visible stations; cumulative simple ⊂ intermediate ⊂ advanced; `"advanced"` previews flagged `comingSoon`; **every `comingSoon` station has `stages: []`**; every station/tier has `en`+`pt` prose + a full `clouds` map. *(red ✓)*
- [x] **T8 — implement (data):** in `stations.ts` add `scenarios` (optional in `*Src`, default = all three) + `comingSoon?`; add the `reranker` station (intermediate) and `gateway`/`guardrails`/`cache`/`eval`/`observability` stations + `aiops` tier (advanced) with full en/pt prose, `clouds`, `stages: []`; add `visibleStationsFor`/`visibleHopsFor`/`visibleTiersFor`/`visibleStationIdsFor`. *(green ✓)*
- [x] **T9 — implement (i18n + cloud):** `node.comingSoon` + `scenario.{label,sendDisabled}` in `i18n/strings.ts` (en + pt); scenario names/blurbs live in `/api/config` (backend, AC2); every new tier/station `clouds` map filled (§4/§5). *(green ✓)*

## D. Layout + projection (AC3, AC4)

- [x] **T10 — test first (AC7 regression):** `phases.test.ts:80` already pins `STAGE_TO_STATION`↔`STAGE_TO_PHASE` parity; added an explicit assertion that **no live Stage maps to a coming-soon station** (guards §3). *(green)*
- [x] **T11 — implement (layout):** `computeLayout(expanded, scenario)` filters columns/tier boxes to the visible set; new station ids in `EXPANDED_H` (= `COLLAPSED_H`) and `TIER_OF`; `aiops` column + tier added; empty tiers skipped; `simple` geometry unchanged. *(green ✓)*
- [x] **T12 — derive: no change needed.** `deriveView` inits all `STATION_IDS` (previews stay idle, no events); scenario scoping is a pure render concern (layout + canvas). Simpler + lower-risk than threading scenario through the projection. *(verified)*

## E. UI wiring (AC4-preview, AC5)

- [x] **T13 — implement (toggle):** `ScenarioToggle.tsx` (header, before `<CloudToggle/>`), prefilled from `/api/config` `scenarios`; mounted in `App.tsx`.
- [x] **T14 — implement (canvas):** `FlowCanvas` uses `visible*For(lang,scenario)` + `computeLayout(expanded,scenario)`; coming-soon tiles dashed/dimmed with an "em breve" badge (StationNode); `readoutFor`/`innerRows` gained grouped cases for the 6 preview ids.
- [x] **T15 — implement (inspector):** `InspectorPanel` shows a dashed coming-soon note for preview nodes; `renderDetail` already tolerates them (returns `undefined` → no case needed).
- [x] **T16 — implement (send gating):** send button + textarea disabled with a bilingual "preview" note when `!canSend(scenario)`. Body omits `scenario` (send only happens in `simple`; backend defaults to it — a later spec wires the field when a rung executes).

## F. Close out

- [x] **T17 — refactor:** all tests green; `simple` structurally identical (AC3) and geometrically unchanged. **Visual verified** via Playwright across all three rungs (simple = today; intermediate adds Reranker; advanced adds the AI-Ops tier — all previews dashed + "coming soon", composer locked). Fixed an Inspector leak found in review (the overview list is now scenario-scoped via `visibleStationsFor`).
- [x] **T18 — status:** `spec.md` → **done**. The repo-wide build/test gate is green (`tsc` clean, `npm run build` ✓, 78 Vitest + 80 pytest, `ruff check` clean). The earlier orphan `time.test.ts` blocker was resolved by the user's concurrent `lib/time.ts`; `MEMORY.md` updated.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC7)
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; keyless guard tests still run)
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` (Vitest) green
- [ ] No protocol change — `events.ts` untouched; every `Stage` still mapped to one station (§6) and one timeline phase (§4-timeline)
- [ ] Every new user-facing string exists in en **and** pt (§4); every new tier/station fills `clouds.{azure,aws,gcp}` (§5)
- [ ] `simple` scenario is byte-for-byte equivalent to the pre-008 app (regression)
- [ ] `spec.md` status updated to `done`
