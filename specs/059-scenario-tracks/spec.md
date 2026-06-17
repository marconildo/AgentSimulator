# Spec: Scenario tracks (themes axis)

| | |
|---|---|
| **ID** | 059-scenario-tracks |
| **Status** | ~~draft~~ → ~~clarified~~ → ~~planned~~ → ~~in-progress~~ → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-16 |

> Add a **second, optional axis** to the maturity ladder (008): **Tracks** (themes).
> The ladder rung (`simple` | `intermediate` | `advanced`) keeps answering *"how
> much of a production pipeline?"*; a **Track** (`all` | `rag` | `agent` | `aiops`
> | `security` | `scale`) answers *"which subsystem am I studying?"* and **narrows
> the preview clusters within a rung**. The Advanced rung stops being a wall of
> tiles; the roadmap content (RAG-quality module, AI-Ops, security, scale) gets a
> coherent home. **Purely a client-side view filter** — it is *not* sent to the
> backend and *never* hides an executing node, so Simple stays byte-for-byte and
> the projection/totality invariants are untouched.

## Problem / motivation

The maturity ladder (008) is **one linear axis**. But the content the project keeps
accreting is genuinely **multi-dimensional** — RAG quality (chunking, metadata,
rerank, hybrid, MMR, self-query, compression, multi-vector, query expansion,
retrieval metrics), agent design (ReAct → DeepAgents → multi-agent), AI-Ops
(gateway, cache, eval, observability, router, multi-provider), security & trust
(guardrails, secrets/DLP, supply chain, sandbox, identity, jailbreak) and scale &
infra (multi-replica, shared state). Squeezing ~5 themes into 3 rungs makes the top
rung a dumping ground (every Advanced tile at once) and leaves "what else goes in
Intermediate?" ambiguous.

A linear ladder can't express a matrix. Adding **more rungs** only pushes the
arbitrary cut around (security and scale straddle any line you draw). The honest
shape is a **second axis**: keep the rung (production-readiness narrative, already
built, Simple sacred) and cross it with a **Track** (theme). "More scenarios" then
becomes *"add a track"*, not *"add a rung"* — the rungs stay fixed at three forever.
This also maps 1:1 to how the content is sourced (course modules/units), so each
future feature spec lands in an obvious `{rung × track}` cell.

## Goals

- **A first-class `Track`** (`all` | `rag` | `agent` | `aiops` | `security` |
  `scale`) — a **global app mode** mirroring `useCloud`/`useScenario` (Zustand +
  localStorage), default **`all`** (today's behavior).
- **Tracks narrow previews, never execution.** The track filter may hide only
  **`comingSoon` preview** nodes/hops; **real/executing nodes and base
  infrastructure are never hidden** by a track. This keeps `deriveView` safe and
  Simple byte-for-byte.
- **`stations.ts` gains a per-tier/station/hop `tracks` membership** (like the 008
  `scenarios` membership) — the single source of truth for *which theme* a preview
  node belongs to. Untagged ⇒ belongs to every track (cross-cutting base).
- **Advanced becomes browsable one cluster at a time** — picking a track on the
  Advanced rung shows only that theme's preview tiles; `all` reproduces today's
  full Advanced preview.
- **A track selector** in the UI, appearing **only on rungs with more than one
  track** (intermediate/advanced), prefilled with bilingual names — absent/no-op on
  Simple.
- **No empty tier boxes** — a tier with zero visible stations under the active
  track is itself hidden; the private-network boundary recomputes.
- **Invariants preserved** — `Stage` enum unchanged; `STAGE_TO_STATION` /
  `STAGE_TO_PHASE` stay total; track scoping is render-gating only.
- All new prose **bilingual** (en + pt) — §4. No new tier/station added here, so no
  new `clouds` map is required (§5 unaffected).

## Non-goals

- **Building any of the themed feature nodes** — MMR, self-query, compression,
  multi-vector, query expansion, chunking strategies, metadata, retrieval metrics,
  gateway, cache, eval, observability, multi-agent, the security cluster, scale —
  each is its **own future spec** (see `docs/roadmap.md`). This spec only adds the
  **axis** and **tags the nodes that already exist** in `stations.ts`.
- **No change to the rungs** — still `simple | intermediate | advanced`; this spec
  does not add, remove or re-order a rung.
- **No backend change** — `Track` is a **view-only client filter**, not a
  `ChatRequest` field (unlike `scenario`). It changes *what the diagram shows*,
  never *how a run executes*. There is therefore no `/api/config` change and no
  protocol mirror.
- **No new executing `Stage`/`Phase`/`TraceEvent`.**
- **No re-homing of nodes across rungs** — a node's `scenarios` membership is
  untouched; tracks only sub-group within a rung.

## User-facing behavior

A **track selector** joins the top-level controls (language, cloud, scenario, ⚙️),
mirroring the cloud switcher's shape. It is **shown only when the active rung
exposes more than one track** — i.e. on **Intermediate** (RAG Quality vs Agent
Design) and **Advanced** (Agent Design / AI-Ops / Security & Trust / Scale & Infra).
On **Simple** the selector is absent (Simple has no themed preview clusters).

Tracks (bilingual name):

- **All** / **Tudo** — show every node the rung declares (today's behavior).
- **RAG Quality** / **Qualidade de RAG** — the retrieval/data-plane cluster.
- **Agent Design** / **Design do Agente** — DeepAgents (Intermediate) → multi-agent
  orchestration (Advanced).
- **AI-Ops** / **AI-Ops** — gateway, semantic cache, eval runner, observability.
- **Security & Trust** / **Segurança & Confiança** — guardrails and the security
  cluster.
- **Scale & Infra** / **Escala & Infra** — multi-replica / shared-state previews.

Selecting a track on Advanced collapses the preview wall to one coherent cluster;
the canvas reflows through the existing layout engine, empty tiers disappear, and
the private-network boundary redraws. Real stations (and the whole Simple view) are
never affected. Each track has a one-line bilingual glossary blurb on hover.

## Acceptance criteria

> Frontend Vitest projection/derive tests (no backend ACs — this spec is view-only).

1. **AC1 — track store.** A `Track` global mode (`all` | `rag` | `agent` | `aiops`
   | `security` | `scale`) exists, persisted to localStorage, mirroring `useCloud`,
   default `all`; an `isTrack` guard rejects unknown values.
2. **AC2 — Simple byte-for-byte.** On `simple`, for **every** track value, the
   visible station/hop/tier set equals today's Simple set (Simple declares no
   track-tagged `comingSoon` nodes, so the track filter is a no-op there) — a pinned
   regression guard.
3. **AC3 — tracks hide only previews.** `visibleStationsFor(lang, scenario, track)`
   hides a station **iff** it is `comingSoon` **and** tagged with `tracks` that
   exclude the active track. A station that is not `comingSoon` (real/executing) or
   carries no `tracks` (base) is **never** hidden by any track — asserted directly.
4. **AC4 — Advanced clusters.** On `advanced`, `track = security` shows the
   guardrails preview and hides gateway / cache / eval / observability / the
   multi-agent workers; `track = aiops` shows gateway/cache/eval/observability and
   hides the security and multi-agent previews; `track = all` shows the full
   Advanced preview set (equals today's Advanced).
5. **AC5 — totality + projection safety.** `STAGE_TO_STATION` and `STAGE_TO_PHASE`
   remain **total** over `Stage`; a test asserts track scoping never removes a
   `Stage` from those maps and never hides a station that an **executing** stage of
   an **available** rung (`simple`, `intermediate`) maps to, for any track.
6. **AC6 — no empty tiers.** A tier whose stations are all hidden under the active
   track is itself excluded from `visibleTiersFor`, and `computeLayout` produces no
   empty tier box; the boundary recomputes around the remaining tiers.
7. **AC7 — selector visibility.** The track selector renders only when the active
   rung has more than one track represented (intermediate/advanced) and not on
   `simple`; switching tracks reflows via the existing layout (no new geometry
   engine).
8. **AC8 — bilingual + no protocol/back-end change.** Every track name + blurb
   exists en **and** pt; no `Stage`/`TraceEvent`/`ChatRequest`/`/api/config` change;
   `events.ts` mirror not required (§1 untouched).

## Protocol / stage impact

§1 & §6.

- New/changed **executing** `Stage`(s): **none**. `Track` is a **client-only view
  filter** — not a request field, not a `TraceEvent` field. **No `events.ts`
  mirror, no `/api/config` change, no backend change.**
- **Station model change:** `stations.ts` gains an optional per-tier/station/hop
  `tracks` membership (sibling of the 008 `scenarios` field). Untagged ⇒ all
  tracks. Only `comingSoon` nodes are track-filtered; real nodes ignore it.
- Station mapping for live stages: **unchanged**; totality maps untouched.

## Clarifications (resolved 2026-06-16)

- [x] **Q1 — Model → two-axis (tracks), not a 4th rung.** Chosen over "Advanced +
  Expert" (arbitrary cut, security/scale straddle it) and over "filters with no
  named model" (no semantics/i18n). Tracks are expressive, map to course modules,
  and are additive in code.
- [x] **Q2 — Track is view-only, not a request field.** Unlike `scenario` (008),
  `Track` does not change execution, so it is **not** sent to the backend — a purely
  client-side projection filter. This is why it touches no protocol and no pytest.
- [x] **Q3 — Tracks filter previews only.** To keep `deriveView` and totality safe,
  the filter may hide only `comingSoon` nodes; real/executing nodes are immune. This
  makes Simple byte-for-byte trivially and prevents a hidden-executing-station bug.
- [x] **Q4 — Selector hidden on Simple.** Simple has no themed clusters; showing the
  selector there would be a no-op control. It appears only on intermediate/advanced.

## Out of scope / deferred

- **The themed feature nodes themselves** (MMR, self-query, compression,
  multi-vector, query expansion, chunking strategies, metadata, retrieval metrics,
  gateway, cache, eval, observability, multi-agent, security cluster, scale) — each
  its own `{rung × track}` spec per `docs/roadmap.md`.
- **A `{rung × track}` deep-link / shareable URL** — nice later, not needed now.
- **Per-track Learn topics** — the Learn map could grow a track filter too; deferred.
- **Surfacing the active track in the trace/HUD** — unnecessary for a view filter.
