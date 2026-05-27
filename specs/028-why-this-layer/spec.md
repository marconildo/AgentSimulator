# Spec: Why this layer / What breaks without it

| | |
|---|---|
| **ID** | 028-why-this-layer |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The visualizer already answers **what** happens at each station (request → memory →
route → retrieve → reason → tools → generate → respond → persist) and **how** each one
is wired (protocols, zones, cloud services). The gap is the **why**: the learner sees
that the Agent sits on a private network, that the App DB is relational while the
Vector DB is HNSW, that MCP runs as a sidecar — but not *why those choices exist* or
*what would break if the layer were removed or merged*.

That "why / what breaks" framing is the single highest-leverage didactic upgrade: it
turns a topology diagram into an argument. A learner who understands *why retrieval is
separate from memory*, or *why the agent runtime is not in the same container as the
public API*, can reason about production trade-offs instead of memorizing a picture.

This also gives a natural, honest home for three caveats the current app under-states:
**auth is a stub** (no real user authentication in the demo), **MCP can also speak
HTTP/SSE** (stdio is one transport, with implications), and the **connection-pool /
single-instance** assumptions. Surfacing these as "what breaks" notes keeps the app
honest about the distance between the demo and production.

## Goals

- Every station carries a short, bilingual **`why`** ("why this layer exists") and
  **`whatBreaks`** ("what breaks without it / if it were merged") explanation, authored
  as content in the single source of truth for the visual model.
- The **Inspector** renders a clearly-labelled **"Why this layer · What breaks without
  it"** section for the selected station, alongside the existing Overview/Timing/tech
  detail — visible without expanding the node.
- The notes name the real trade-off where one exists (e.g. App DB vs Vector DB:
  transactional state vs approximate nearest-neighbour; agent on a private network:
  blast-radius / least-privilege; MCP sidecar over stdio vs HTTP/SSE: isolation,
  secrets, scalability; single-instance trace store: lost on restart, not shared).
- Honest-limitation notes where the demo simplifies production: **authentication is a
  stub** (surfaced on the public-facing stations), and the **single-instance** / pooling
  assumptions (App DB).
- All new prose ships in **English and Portuguese** (constitution §4).
- No execution changes: this is content + a render. The pipeline, protocol, stages and
  cloud map are untouched.

## Non-goals

- **No new `Stage`/`Phase`/`TraceEvent`, no new station/hop/tier.** This adds two
  descriptive fields to the existing station metadata and one Inspector section.
- Not a quiz, not interactive branching, not a per-trade-off deep dive page (the Learn
  tab already hosts long-form topics; this is the at-a-glance "why" *in the Inspector*).
- Not changing the existing blurb/tech rows — `why`/`whatBreaks` are additive, distinct
  from the existing `blurb` (which describes *what* the station does).
- Not adding "why" to the non-executing preview nodes' behavior (they may carry the
  fields for completeness, but no execution depends on them).

## User-facing behavior

When the user selects a station (clicks the node, or opens it from the Overview), the
Inspector shows — below the existing summary — a **"Why this layer · What breaks
without it"** block with two short paragraphs:

- **Why this exists** — the reason the layer is its own thing (one or two sentences).
- **What breaks without it** — the concrete failure or trade-off if it were removed,
  merged into a neighbour, or skipped.

Examples of the intended content (final wording lives in `plan.md` / the source):

- **Agent (private runtime)** — *Why:* the reasoning loop holds secrets and tool access,
  so it runs on a private network the internet can't reach. *What breaks:* put it in the
  public API container and a single web-tier compromise exposes every tool credential
  and the model egress.
- **App Database vs RAG Vector DB** — *Why:* transactional conversation state and
  approximate-nearest-neighbour search are different jobs with different engines.
  *What breaks:* force both into one store and you either lose ACID guarantees or pay
  vector-search latency on every transactional read.
- **MCP Tools (sidecar / stdio)** — *Why:* tools are isolated behind a standard protocol
  so the agent doesn't hard-link tool code. *What breaks:* inline the tools and every
  tool dependency/secret lives in the agent process; note stdio is local-only — HTTP/SSE
  is the transport when tools must scale or live out-of-process.
- **Frontend / Backend (public edge)** — *Why:* a thin, validated public edge terminates
  TLS and is the only internet-facing surface. *What breaks / honest caveat:* there is
  **no real auth in this demo** (a stub) — production needs authn/z, rate limiting and a
  session/identity before the agent ever runs.

All of these strings ship in **en + pt**.

## Acceptance criteria

> Frontend assertions; structural and content-completeness, no model needed.

1. **AC1 — Every executing station has both fields, bilingual.** For each station that
   carries live `stages` (the 7 today's-app stations), the resolved metadata exposes a
   non-empty `why` and a non-empty `whatBreaks` string for **both** `en` and `pt`.
2. **AC2 — Inspector renders the section.** When a station is selected, the Inspector
   shows a labelled "Why this layer / What breaks" section containing that station's
   `why` and `whatBreaks` text; selecting a different station updates both.
3. **AC3 — The section is bilingual end-to-end.** Toggling the language switches the
   `why`/`whatBreaks` text along with the rest of the Inspector (no English-only leak
   when `pt` is active).
4. **AC4 — Honest caveats are present.** The public-edge station(s) `whatBreaks` text
   states that authentication is a stub in the demo; the MCP station mentions the
   HTTP/SSE transport alternative to stdio; the App DB station mentions the
   single-instance / pooling assumption. (Asserted as substring/keyword presence per
   language so wording can evolve without breaking the test.)
5. **AC5 — No protocol or visual-model drift.** No `Stage`/`Phase`/`TraceEvent` change;
   `STAGE_TO_STATION` and `STAGE_TO_PHASE` and their parity tests are unchanged; the
   `tsc` build stays green (the new fields are additive to the station type).

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none new** — adds `why`/`whatBreaks` fields to
  the existing `StationMeta` (translatable `{ en, pt }`), rendered by the Inspector.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Inspector vs inline-expansion vs Learn?** → In the **Inspector** (always visible
  when a station is selected), not gated behind the node's ⊕ expansion and not a Learn
  page — the "why" should sit next to the live data the learner is already reading.
- [x] **Distinct field or extend `blurb`?** → **Distinct fields** (`why`, `whatBreaks`).
  `blurb` answers *what*; these answer *why* / *what-breaks*. Keeping them separate keeps
  each short and lets the Inspector label them.
- [x] **Do preview nodes need them?** → Optional. The acceptance criteria only require
  them on the executing stations; preview nodes may carry them for completeness but
  nothing tests or depends on it.

## Out of scope / deferred

- A dedicated "trade-offs" Learn topic that expands each note into a full discussion.
- "What breaks" notes on individual **network hops** (this spec is station-scoped).
- An interactive "remove this layer" toggle that animates the failure (a fun future
  idea, but its own spec — it would touch the projection).
