# Plan: Scenario framework (maturity ladder)

> The HOW. Written after `spec.md` is `clarified`. Decisions here respect every
> principle in `.specify/constitution.md`. No principle is bent — the upper rungs
> are non-executing previews (so §3 everything-is-real is untouched), `scenario`
> is a request-only input (so §1 the event protocol is unchanged), and the
> selection is global in-memory client state (so §8 single-instance holds).

## Approach

Introduce `Scenario` (`simple | intermediate | advanced`) as a **request-only
input** — the exact pattern 006 used for prompt/tools/top-k — plus a **global
client store** (mirroring `useCloud`). The visual model in `stations.ts` becomes
**scenario-scoped**: each tier/station/hop declares which rungs it belongs to,
and a `comingSoon` flag marks not-yet-built nodes. `computeLayout` and
`deriveView` take the active scenario and render only its visible set.

`simple`'s membership reproduces today's exact set, so the default app is
byte-for-byte unchanged (regression-guarded). `intermediate`/`advanced` add
**non-executing preview tiles** (dashed/dimmed, labelled "coming soon"); selecting
them **disables send** with a bilingual note, so nothing ever fakes a run. Each
later spec (009+) lights a rung up by flipping a node's `comingSoon` to false and
wiring its real `Stage`.

**Why a 4th "AI Ops" tier for Advanced** (vs cramming nodes into the existing
data column): the assessment's core recommendation is exactly an "AI Ops" column
(gateway, guardrails, cache, eval, observability). Modelling it as a first-class
tier keeps the data column legible, gives those nodes an honest cloud map, and
matches the n-tier story the app already tells. Intermediate stays light — it
adds a single `reranker` node into the existing data column plus a token/cost
*readout* (the readout is a later spec; here it is only reserved).

**Alternative considered & rejected:** branching the *backend pipeline* per
scenario now. Rejected — there are no real upper-rung nodes yet, so the backend's
only job in 008 is to accept + validate the field and echo it. Branching arrives
with each node's spec. (Send is gated to `simple` client-side, so in practice the
backend always receives `simple` until then; the seam + validation still ship now
per AC1.)

## Affected files

**Backend**
- `backend/app/schemas.py` — new `Scenario(StrEnum)` (`simple/intermediate/advanced`);
  `ChatRequest` gains `scenario: Scenario = Scenario.SIMPLE` (request-only, like the
  006 overrides). Not a `TraceEvent` field.
- `backend/app/main.py` — `/api/config` returns a `scenarios: [...]` array
  (id + bilingual name/blurb + `available`/`coming_soon`); `/api/chat` echoes
  `scenario` into the existing `request_body` (007 transparency); thread
  `scenario` into `run_agent` (stored on state, no branching yet).
- `backend/app/agent/state.py` — `AgentState` gains `scenario: str` (carried, unused
  by node logic in 008 — reserved for later specs).
- `backend/app/agent/graph.py` — `run_agent(..., scenario=...)` param → initial state.

**Frontend**
- `frontend/src/lib/scenario.ts` — **new.** `Scenario` type, `SCENARIOS` list,
  `useScenario` Zustand store (global, localStorage, default `simple`) — a direct
  analog of `cloud.ts`. Plus `canSend(scenario)` (true only for available rungs)
  and `scenarioRequestField(scenario)` for the send path.
- `frontend/src/lib/stations.ts` — add `scenarios: Scenario[]` + `comingSoon?: boolean`
  to the station/tier/hop **types and `*Src`**; tag existing items with all three
  rungs; add the new `reranker` (intermediate) + `gateway`/`guardrails`/`cache`/
  `eval`/`observability` (advanced) stations and an `aiops` tier as data; add
  scenario-filtered builders (`visibleStationsFor(lang, scenario)`,
  `visibleHopsFor`, `visibleTiersFor`) used by layout/canvas. `STAGE_TO_STATION`
  stays derived from `stages` — coming-soon nodes carry `stages: []`, so it is
  unchanged (AC7).
- `frontend/src/lib/layout.ts` — `computeLayout(expanded, scenario)`: filter the
  `COLUMNS` members + tier boxes to the scenario's visible stations; add the new
  station ids to `EXPANDED_H`/`TIER_OF`/`COLUMNS` (coming-soon nodes are
  collapsed-only: `EXPANDED_H = COLLAPSED_H`); add the `aiops` column + tier box;
  the boundary recompute already generalizes.
- `frontend/src/lib/derive.ts` — `deriveView(events, cursor, scenario)`: iterate the
  scenario's visible station ids (not all `STATION_IDS`) so the projection matches
  the rendered set. `STAGE_TO_STATION` lookups are unaffected.
- `frontend/src/lib/sse.ts` — include `scenario` in the POST body (always `simple`
  in practice, since send is gated; sent for forward-compat + honesty).
- `frontend/src/components/ScenarioToggle.tsx` — **new.** Three-rung switcher in
  the header beside `<CloudToggle/>`, prefilled from `/api/config`'s `scenarios`.
- `frontend/src/components/FlowCanvas.tsx` — pass `scenario` into `computeLayout`/
  `deriveView`; render coming-soon tiles distinctly; `readoutFor` gains cases for
  the new `StationId`s (a "coming soon" readout) — the switch is exhaustive.
- `frontend/src/components/InspectorPanel.tsx` — `renderDetail` gains the new
  `StationId` cases (a "coming soon" panel that links to the relevant Learn topic).
- `frontend/src/components/ChatPanel` (send button) — disable send + show the
  bilingual "coming soon" note when `!canSend(scenario)`.
- `frontend/src/App.tsx` — mount `<ScenarioToggle/>` in the header.
- `frontend/src/types/events.ts` — **no change** (`scenario` is not a trace event).
- `frontend/src/i18n/strings.ts` — scenario names/blurbs + "coming soon" + send-
  disabled note (en + pt).

## Protocol changes (constitution §1)

**None.** No new/changed `Stage`/`Phase`/`TraceEvent`; `events.ts` is untouched.
`scenario` is a request-only field (documented API contract, not the event
protocol) — exactly the 006 precedent. `STAGE_TO_STATION` / `STAGE_TO_PHASE` stay
total over the unchanged `Stage` enum (AC7). New coming-soon `StationId`s force
new `readoutFor`/`renderDetail`/`EXPANDED_H`/`TIER_OF` cases (exhaustive switches),
each rendering a "coming soon" placeholder.

## Data model changes

None. No Chroma or SQLite change. Scenario is ephemeral client state + a request
field.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| scenario.simple.name | Simple | Simples |
| scenario.simple.blurb | ReAct + vector RAG + MCP tools, single-turn | ReAct + RAG vetorial + ferramentas MCP, turno único |
| scenario.intermediate.name | Intermediate | Intermediário |
| scenario.intermediate.blurb | Adds reranking, hybrid search and real token/cost | Adiciona reranking, busca híbrida e custo/token real |
| scenario.advanced.name | Advanced | Avançado |
| scenario.advanced.blurb | Production AI-Ops: gateway, guardrails, cache, evals, observability | AI-Ops de produção: gateway, guardrails, cache, evals, observabilidade |
| scenario.comingSoon | Coming soon | Em breve |
| scenario.sendDisabled | This scenario is a preview — sending runs in Simple | Este cenário é um preview — o envio roda no Simples |
| station.reranker.* / .gateway.* / .guardrails.* / .cache.* / .eval.* / .observability.* | (title/subtitle/blurb/tech per node) | (idem, pt) |
| tier.aiops.title / .alias / .generic | AI Ops / Observability & control / Eval, guardrails, gateway, cache | Operações de IA / Observabilidade e controle / Eval, guardrails, gateway, cache |

*(Exact per-node prose finalized in the implement tasks; all ship en + pt.)*

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| tier `aiops` | Observability & model control plane | Azure API Management + Monitor/App Insights | API Gateway + CloudWatch/Bedrock Guardrails | Apigee + Cloud Monitoring/Vertex |
| `gateway` | LLM gateway / router | Azure API Management (AI gateway) | Bedrock + API Gateway | Apigee / Vertex endpoints |
| `guardrails` | Input/output safety filter | Azure AI Content Safety | Bedrock Guardrails | Vertex safety filters / Model Armor |
| `cache` | Semantic / prompt cache | Azure Cache for Redis | ElastiCache (Redis) | Memorystore (Redis) |
| `eval` | Eval runner (RAGAS / LLM-judge) | Azure AI Evaluation | Bedrock model evaluation | Vertex Gen AI evaluation |
| `observability` | LLM trace/metrics sink | Azure Monitor / App Insights | CloudWatch / X-Ray | Cloud Trace / Cloud Monitoring |
| `reranker` (intermediate) | Cross-encoder reranker | Azure AI Search semantic ranker | Bedrock rerank / Cohere | Vertex ranking API |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `ChatRequest` accepts `scenario`; defaults to `simple`; invalid ⇒ 422; omitting it leaves the run structurally identical to today | `backend/tests/test_scenario.py` |
| AC2 | `GET /api/config` returns a `scenarios` array with id + bilingual name/blurb + `available`/`coming_soon` | `backend/tests/test_scenario.py` (+ extend `test_config`/`test_api` if present) |
| AC3 | `visibleStationsFor(lang,"simple")` == today's 7 ids; `visibleHopsFor` == today's hops; pinned snapshot | `frontend/src/lib/scenario.test.ts` |
| AC4 | `visibleStationsFor("advanced")`/`("intermediate")` include the coming-soon ids flagged `comingSoon`; **every coming-soon station has `stages: []`** (no live stage maps to a preview node); `canSend("intermediate")===false` | `frontend/src/lib/scenario.test.ts` |
| AC5 | `useScenario`: default `simple`, `setScenario` updates, persists to localStorage, is global (not keyed by conversation) — mirrors `theme.test.ts`/cloud | `frontend/src/lib/scenario.test.ts` |
| AC6 | every scenario name/blurb and every new station/tier has both `en` and `pt`; every new tier/station fills `clouds.{azure,aws,gcp}` | `frontend/src/lib/scenario.test.ts` (+ existing i18n parity test if any) |
| AC7 | `STAGE_TO_STATION` and `STAGE_TO_PHASE` remain **total** over `Stage` and share the same key set (regression: scenario scoping removed no stage) | `frontend/src/lib/phases.test.ts` (extend) |

Backend tests run against OpenAI per `003`; the AC1 "identical to today" assertion
reuses the existing structural style (stages fired / stations active) rather than
asserting exact text. Frontend tests are pure Vitest (no component runner needed —
`canSend` and the visible-set builders are pure functions).

## Risks / trade-offs

- **Layout legibility of the Advanced rung** is the heaviest part. Mitigation: a
  dedicated `aiops` column + collapsed-only coming-soon tiles, leaning on the
  existing column auto-stack so geometry stays declarative. If the Advanced column
  gets too tall, the coming-soon node *set* can be trimmed to headline nodes
  (gateway, guardrails, observability) with cache/eval deferred to their specs —
  a tasks-level adjustment, not a spec change.
- **Exhaustive-switch churn:** six new `StationId`s touch `EXPANDED_H`, `TIER_OF`,
  `readoutFor`, `renderDetail`. This is intentional friction (the model's single
  source of truth) and `tsc` enforces it — no silent gaps.
- **"Advanced" must never look live.** The coming-soon styling + disabled send are
  load-bearing for §3 honesty; AC4 pins that no live `Stage` maps to a preview node.
- **Scope creep into real nodes.** Strictly out of scope here; 009+ own them. The
  plan reserves identity/geometry only.
