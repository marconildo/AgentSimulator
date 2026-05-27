# Spec: Cloud-aware Learn map — "Build on {cloud}" column

| | |
|---|---|
| **ID** | 024-learn-cloud-column |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The app has a cloud toggle (Generic / Azure / AWS / GCP) that rewrites the canvas labels and
— since spec 023 — the per-topic cloud block inside a Learn topic's detail. But on the **Learn
map itself** (the roadmap-style graph the page opens on) switching the cloud does **nothing
visible**: the cloud-specific service names are buried one click deep, inside each topic.

A learner who selects Azure to study *"how would I actually build this on Azure?"* sees the
same generic map. The per-cloud managed-service mapping for every architectural element
already lives in `stations.ts` (`clouds: { azure, aws, gcp }`), so the data exists — it is
simply never surfaced on the map. The toggle should *reward* the learner on the page they are
looking at, not only after they drill into a topic.

Separately, the cloud toggle identifies each provider with a generic emoji (☁️ 🔷 🟧 🟢). The
🔷/🟧/🟢 squares are not the providers' marks and read as decoration, not "Azure / AWS / GCP".

## Goals

- When a cloud is selected on the Learn page, a **new column ("Build on {cloud}")** appears on
  the map listing the concrete managed service for each architectural layer of *this* system,
  drawn from the same `clouds{}` model the canvas already uses (no duplicated service names).
- Clicking a node in that column opens the **related existing Learn topic**, whose detail
  already shows the spec-023 cloud block — so the column is a fast index into "the cloud story".
- Selecting **Generic** shows no extra column (today's behavior, byte-for-byte).
- The cloud toggle uses each provider's **official brand mark** (inline SVG, zero new
  dependency) instead of emoji, so the active provider is recognizable at a glance.
- All new user-facing text ships in **English and Portuguese** (constitution §4).

## Non-goals

- **No change to the event protocol, no new `Stage`/`Phase`/`TraceEvent`, no new canvas
  station/tier/hop.** This is Learn-page rendering + the toggle's icons only; the simulator
  pipeline and the `stations.ts` model are read-only here.
- Not authoring new prose per cloud — the column reuses the existing `clouds{}` service names
  and links to existing topics; it adds no new per-topic cloud notes (spec 023 owns those).
- Not a deployment generator, cost estimator, or Terraform export — purely an orientation map.
- Not changing the canvas (simulator) cloud overlay; only the Learn page gains the column.

## User-facing behavior

On the **Learn page**, with the header cloud toggle set to a provider (Azure / AWS / GCP):

- a new column appears to the right of the existing sections, headed by the provider's brand
  icon and the title **"On {Azure}"** (pt: **"Em {Azure}"**, reusing the existing `onCloud`
  label) plus a short hint;
- the column lists one node per architectural layer of this system — Client, API, Agent, LLM,
  Vector DB, App database, MCP tools, Private network — each showing the layer name and the
  **concrete managed service** for the active cloud (e.g. *LLM → Azure OpenAI*), taken from the
  shared visual model;
- clicking a node opens that layer's existing Learn topic in the detail panel (which shows the
  cloud block from spec 023);
- switching the toggle to **Generic** removes the column entirely; switching between providers
  swaps the service names in place.

In the **cloud toggle** (header and ⚙ menu), each provider is shown with its official brand
mark rendered as an inline SVG (Generic keeps a neutral cloud glyph).

## Acceptance criteria

1. **AC1 — Generic shows nothing** — Given the active cloud is `generic`, when the cloud guide
   is resolved (`cloudGuideFor("generic", lang)`), then it is **empty** for both `en` and `pt`,
   and the map builder produces **no** cloud column (no `cloud-col` node, no `cloud:*` node).

2. **AC2 — Services come from the shared model** — Given the active cloud is `azure`/`aws`/`gcp`
   in either language, when the guide is resolved, then it is **non-empty** and **every entry's
   `service` equals `cloudValue(<the element its `ref` resolves to in stations.ts>, cloud)`**
   and is non-empty; **every entry's `ref`** resolves to a real station/tier/boundary and
   **every entry's `topicId`** resolves to a real topic in `allTopicsFor(lang)`. (Guards against
   service-name duplication and against ref/topic drift.)

3. **AC3 — Bilingual parity (§4)** — Given the guide built for `en` and for `pt` (each cloud),
   then both have the **same length** and the **same `topicId`s in the same order**, and every
   entry's **`label` resolves to a non-empty string** in both languages.

4. **AC4 — Map column rendering** — Given a non-generic cloud, when the Learn map graph is
   built, then it contains a **`cloud-col` header node** and exactly **one `cloud:{topicId}`
   node per guide entry**; the cloud node ids are **namespaced** (prefixed) so they never
   collide with the existing topic nodes, and selecting one resolves back to the **real
   `topicId`**.

5. **AC5 — Brand icons for every cloud** — Given the cloud icon registry, then it provides a
   renderable icon component for **every `CloudId`** (`generic`, `azure`, `aws`, `gcp`), and the
   toggle renders these instead of the previous emoji.

6. **AC6 — i18n chrome (§4)** — Given the UI strings, then any new Learn chrome string added for
   the column (the header hint) exists in **both** `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **none** (no new canvas node; the column only
  *references* existing station/tier/boundary ids to reuse their `clouds{}` map, read-only)

## Open questions (clarify before planning)

_All resolved (clarified with the user 2026-05-27):_

- [x] Form of the cloud surface → **a new column in the Learn map** (vs. a sidebar panel or
  per-node badges).
- [x] Icon source → **inline SVG brand marks, zero new dependency** (vs. adding `react-icons`).
- [x] Column node click → opens the **related existing topic** (reuses spec-023 cloud block).

## Out of scope / deferred

- A per-cloud column on the **canvas** (simulator) page — this spec is Learn-only.
- Deep-linking to the cloud column by URL; search/filter on the map.
- Exhaustive cloud coverage (every station) — a curated, end-to-end layer list is the bar.
