# Plan: Scenario tracks (themes axis)

> The HOW. Written after `spec.md` is `clarified`. No principle is bent — `Track`
> is a **view-only client filter** (so §1 the event protocol and the backend are
> untouched), it hides **only `comingSoon` previews** (so §3 everything-is-real and
> the projection invariants hold), and the selection is global in-memory client
> state (so §7 single-instance is irrelevant — nothing crosses the wire).

## Approach

Add a **second visibility axis** to the 008 scenario seam, entirely on the
frontend. `Track` (`all | rag | agent | aiops | security | scale`) is a **global
client store** mirroring `useScenario`/`useCloud`. `stations.ts` gains an optional
`tracks` membership on tier/station/hop meta — the sibling of the 008 `scenarios`
field. The visible-set builders take the active track and **narrow within the
rung**, with one load-bearing safety rule:

> **A track may hide a node only if that node is `comingSoon`.** Real/executing
> nodes (`!comingSoon`) and untagged base nodes are *always* kept.

This single rule makes everything safe: Simple has no track-tagged previews, so the
filter is a no-op there (byte-for-byte, AC2); `deriveView` can never lose an
executing station to a track (AC5); and the Advanced rung — which is *all*
`comingSoon` previews today — collapses cleanly to one themed cluster (AC4). Because
`Track` never changes execution, it is **not** added to `ChatRequest` and never
reaches the backend (contrast `scenario`, which is a request field). No pytest, no
`/api/config`, no `events.ts`.

The track selector is a small header control like `CloudToggle`, rendered **only
when the active rung has more than one track represented** (a pure derivation:
`tracksForScenario(scenario).length > 1`) — present on intermediate/advanced, absent
on simple.

**Alternative considered & rejected:** a 4th rung ("Expert"). Rejected — the cut
between Advanced and Expert is arbitrary, and security/scale straddle it; a second
axis expresses the matrix the content actually is, and keeps the rungs fixed at
three (so "more scenarios" never means "more rungs").

## Affected files

**Frontend only.**

- `frontend/src/lib/track.ts` — **new.** `Track` type, `TRACKS` list (id + bilingual
  name + glossary blurb), `useTrack` Zustand store (global, localStorage, default
  `all`), `isTrack` guard. Direct analog of `cloud.ts`.
- `frontend/src/lib/stations.ts` —
  - add `tracks?: Track[]` to `StationMeta`/`TierMeta`/`HopMeta` **and** their `*Src`
    types (omitted ⇒ all tracks, i.e. base/cross-cutting);
  - tag the existing `comingSoon` previews: `rerank`-adjacent previews (`hybrid`,
    future RAG nodes) → `rag`; `researcher`/`coder`/`critic` → `agent`;
    `gateway`/`cache`/`eval`/`observability` → `aiops`; `guardrails` → `security`;
    (no `scale` preview node exists yet — the track is reserved for a future
    multi-replica tile);
  - extend the visible-set builders to a **track-aware** signature:
    `visibleStationsFor(lang, scenario, track)`, `visibleHopsFor(lang, scenario,
    track)`, `visibleTiersFor(lang, scenario, track)`. Keep the old call sites
    compiling via a defaulted `track = "all"` argument so unrelated callers are
    untouched;
  - the filter predicate: keep a node when `scenarioMatch && (track === "all" ||
    !node.comingSoon || (node.tracks ?? ALL_TRACKS).includes(track))`;
  - `visibleTiersFor` additionally drops a tier with **zero** visible stations under
    the active track (AC6);
  - add `tracksForScenario(scenario): Track[]` (which non-`all` tracks have at least
    one node in that rung) — drives selector visibility (AC7).
- `frontend/src/lib/layout.ts` — `computeLayout(expanded, scenario, track = "all")`:
  pass the track through to the visible-set filter so the columns/tier boxes/boundary
  reflow to the narrowed set. No new geometry — same engine, smaller input.
- `frontend/src/lib/derive.ts` — `deriveView(events, cursor, scenario, track = "all")`:
  iterate the **track-narrowed** visible station ids. Safe by construction — the
  filter never removes a non-`comingSoon` station, and only available rungs emit
  events (AC5).
- `frontend/src/components/TrackToggle.tsx` — **new.** Selector beside
  `<ScenarioToggle/>`, rendered only when `tracksForScenario(scenario).length > 1`,
  options prefilled from `TRACKS` filtered to the rung. Mirrors `CloudToggle`.
- `frontend/src/components/FlowCanvas.tsx` — read `useTrack`, pass `track` into
  `computeLayout`/`deriveView`. `readoutFor` is unchanged (no new `StationId`).
- `frontend/src/App.tsx` (or wherever `ScenarioToggle` mounts) — mount
  `<TrackToggle/>` next to the scenario switcher.
- `frontend/src/i18n/strings.ts` — track names + blurbs (en + pt); a `glossary`
  entry per track for the hover tooltip.

**No backend files. No `events.ts`. No spec-new `Stage`/tier/station.**

## Protocol changes (constitution §1)

**None.** `Track` is a client-only view filter — not a `Stage`, `TraceEvent`,
`ChatRequest` field, or `/api/config` key. `events.ts` untouched. `STAGE_TO_STATION`
/ `STAGE_TO_PHASE` stay total over the unchanged `Stage` enum (AC5). No new
`StationId` ⇒ no new exhaustive-switch cases in `readoutFor`/`renderDetail`.

## Data model changes

None. No Chroma, no SQLite. `Track` is ephemeral client state (localStorage only).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| track.all.name | All | Tudo |
| track.all.blurb | Show every node this rung declares | Mostra todos os nós que este degrau declara |
| track.rag.name | RAG Quality | Qualidade de RAG |
| track.rag.blurb | Retrieval data-plane: chunking, metadata, rerank, hybrid, MMR… | Data-plane de recuperação: chunking, metadados, rerank, híbrida, MMR… |
| track.agent.name | Agent Design | Design do Agente |
| track.agent.blurb | Agent sophistication: DeepAgents → multi-agent orchestration | Sofisticação do agente: DeepAgents → orquestração multi-agente |
| track.aiops.name | AI-Ops | AI-Ops |
| track.aiops.blurb | Run it in production: gateway, cache, evals, observability | Rodar em produção: gateway, cache, evals, observabilidade |
| track.security.name | Security & Trust | Segurança & Confiança |
| track.security.blurb | Guardrails, secrets, supply chain, sandbox, identity | Guardrails, segredos, cadeia de suprimentos, sandbox, identidade |
| track.scale.name | Scale & Infra | Escala & Infra |
| track.scale.blurb | Multi-replica, shared state, workload identity | Multi-réplica, estado compartilhado, workload identity |

*(The `scale` track is selectable but has no preview node yet — it lights up with
the multi-replica spec. Shown so the axis is complete; on a rung where it has no
node, it simply isn't offered by `tracksForScenario`.)*

## Cloud map (constitution §5)

**N/A** — this spec adds no tier or station, so there is no new `clouds` map to
fill. (The existing nodes it *tags* already carry their §5 maps from 008.)

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `useTrack` default `all`, `setTrack` updates + persists to localStorage; `isTrack` rejects junk — mirrors `cloud`/`theme` store tests | `frontend/src/lib/track.test.ts` |
| AC2 | for **every** track, `visibleStationsFor(lang,"simple",track)` / `visibleHopsFor` / `visibleTiersFor` equal the `"simple","all"` baseline (pinned) | `frontend/src/lib/track.test.ts` |
| AC3 | a `comingSoon` station tagged `["security"]` is hidden under `track="aiops"` and shown under `"security"`/`"all"`; a non-`comingSoon` station and an untagged station are shown under **every** track | `frontend/src/lib/track.test.ts` |
| AC4 | on `"advanced"`: `track="security"` ⇒ visible ids include `guardrails`, exclude `gateway`/`cache`/`eval`/`observability`/`researcher`/`coder`/`critic`; `track="aiops"` ⇒ inverse; `track="all"` ⇒ equals today's advanced set | `frontend/src/lib/track.test.ts` |
| AC5 | `STAGE_TO_STATION`/`STAGE_TO_PHASE` total + same key set; for `scenario∈{simple,intermediate}` and **every** track, no station that an executing `Stage` maps to is absent from `visibleStationsFor` | `frontend/src/lib/phases.test.ts` (extend) + `track.test.ts` |
| AC6 | a tier whose only stations are `comingSoon` of track X is absent from `visibleTiersFor` under track Y; `computeLayout` emits no empty tier box | `frontend/src/lib/track.test.ts` + `layout.test.ts` (extend) |
| AC7 | `tracksForScenario("simple").length <= 1` (selector hidden); `tracksForScenario("advanced").length > 1` (selector shown); `TrackToggle` renders nothing on simple | `frontend/src/lib/track.test.ts` (+ a small `TrackToggle.test.tsx` if a component test is warranted) |
| AC8 | every `TRACKS` entry has `name.en`/`name.pt` + `blurb.en`/`blurb.pt`; no `events.ts`/schema diff (guarded by the existing protocol-mirror test staying green) | `frontend/src/lib/track.test.ts` |

All tests are pure Vitest over pure functions (visible-set builders + the store) —
no backend, no component runner required beyond an optional `TrackToggle` smoke test.

## Risks / trade-offs

- **Builder signature churn.** Widening `visibleStationsFor`/`visibleHopsFor`/
  `visibleTiersFor`/`computeLayout`/`deriveView` with a `track` arg touches every
  call site. Mitigation: default `track = "all"` so unrelated callers compile
  untouched and behavior is identical until a caller opts in (`FlowCanvas`).
- **Two filters interacting.** Scenario and track now both gate visibility. The
  `!node.comingSoon` escape hatch keeps them orthogonal and safe; AC3/AC5 pin it.
- **Selector clutter.** Four header controls (lang/cloud/scenario/track) risks a
  busy header. Mitigation: render `TrackToggle` only when it has >1 option, so
  Simple users never see it; consider grouping scenario+track visually (tasks-level,
  not a spec concern).
- **Empty-tier edge.** Narrowing can empty a tier; AC6 + `visibleTiersFor` dropping
  zero-station tiers prevents a stray empty box. Covered by a layout test.
- **Scope creep into real nodes.** Strictly out of scope; this spec only adds the
  axis and tags existing previews. The themed feature nodes are their own specs.
