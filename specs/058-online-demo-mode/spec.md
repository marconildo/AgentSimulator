# Spec: Online demo mode (mocked, backend-less)

| | |
|---|---|
| **ID** | 058-online-demo-mode |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-16 |

## Problem / motivation

The simulator is a portfolio piece. We want a public URL that hundreds of people
can open at once to *see the flow work* — without us paying for their tokens,
without a server per visitor, and without exposing or requiring any OpenAI key.

The live, key-required app already exists and is the "real" experience; that one
stays the GitHub-local route (`README` / `docker compose up`). What we lack is a
**zero-backend, infinitely-scalable showcase build** that replays real captured
runs for a fixed set of sample questions, across the two executing maturity rungs
(Simple and Intermediate), and points visitors at GitHub for the full live tool.

This is deliberately a **build-time mode** (`VITE_DEMO_MODE`), not a runtime toggle:
the normal local build is unchanged, byte-for-byte.

## Goals

- A `VITE_DEMO_MODE` build that boots and runs with **no backend reachable** — every
  network read is served from bundled fixtures or an in-memory session store.
- The canvas/inspector animate **real captured traces** (constitution §3) for a fixed
  set of sample questions, in **both** Simple and Intermediate scenarios, in **en + pt**.
- Free-text input, file upload, and all database-mutating actions are disabled in the
  demo build; only the pre-fixed sample questions can be sent.
- A bilingual banner explains it's a demo and links to GitHub for the full live version.
- Independent sessions: hundreds of concurrent visitors never share state (it's a
  static bundle + per-tab in-memory store; nothing is persisted).
- The default (non-demo) build is unchanged — `VITE_DEMO_MODE` unset ⇒ today's behavior.

## Non-goals

- No hosted backend, no "bring your own key" path online (that stays GitHub-local).
- No new pipeline `Stage`, `Phase`, or `TraceEvent` — demo replays the existing protocol.
- Not a generic offline cache of arbitrary questions — only the curated sample set.
- The Advanced rung stays `comingSoon` (non-executing), exactly as today.

## User-facing behavior

In a demo build (`VITE_DEMO_MODE=1`):

- A top banner: *"Demo mode — sample questions only. Run the full live version with
  your own OpenAI key →"* + a GitHub link. (en + pt.)
- The composer textarea is **disabled** with a hint to pick a sample question; the
  send button and the 📎 upload button are hidden/disabled.
- A persistent **sample-question bar** offers the curated questions as one-click chips
  (the same set as the empty-state examples). Clicking one replays its captured trace
  for the currently-selected scenario and language.
- Switching scenario (Simple ↔ Intermediate) and language (en ↔ pt) selects which
  captured trace plays — Intermediate visibly adds the `rag.rerank` sub-stage on RAG
  questions, so the two rungs are honestly differentiated.
- Settings: cloud/language/scenario/delivery toggles stay; "Clear databases", agent
  editing, and skills editing are hidden (nothing to mutate).
- Everything else — step/replay, drill-ins, inspector, execution traces, token budget —
  works unchanged, because it is a pure projection of the (now canned) events.

In a normal build (`VITE_DEMO_MODE` unset) none of the above appears and the app talks
to the backend exactly as today.

## Acceptance criteria

1. **AC1** — `isDemo()` is `false` when `VITE_DEMO_MODE` is unset and `true` only when it
   is `"1"`/`"true"`. With it `false`, the network helpers (`health.load`, chat send,
   trace fetch, catalog reads) take their existing fetch path unchanged (no demo branch).
2. **AC2** — In demo mode, `demoHealth()` resolves to a `status:"ok"` health with a model
   name and `hasKey:true`, so the app never shows the offline/no-key banner with no backend.
3. **AC3** — In demo mode, the catalog/boot reads (`listSessions`, `createSession`,
   `listAgents`, `listMessages`, `getConfig`, `listSkills`, `listDocuments`) resolve from
   fixtures / the in-memory store without any `fetch` to a backend.
4. **AC4** — Given a curated question `q`, scenario `s ∈ {simple, intermediate}` and
   language `l ∈ {en, pt}`, `selectDemoTrace(q, s, l)` returns a real captured
   `TraceEvent[]` whose stages all map via `STAGE_TO_STATION`; for an `intermediate` RAG
   question the events include a `rag.rerank` stage that the `simple` capture does not.
5. **AC5** — Sending a curated question in demo mode (via the store `send(text)`) appends a
   message whose `id === trace_id` of the selected fixture, drives the simulator to a
   finished run, and settles the chat bubble to the fixture's captured answer — with no
   backend call.
6. **AC6** — `selectDemoTrace` falls back gracefully: an unknown/missing (question,
   scenario, language) combination resolves to a real captured trace (e.g. the en or the
   simple capture) rather than throwing, so the demo never dead-ends.
7. **AC7** — In a demo build the composer free-text textarea is disabled and the upload
   control is not rendered; the sample-question chips are rendered and clickable.
8. **AC8** — Every new user-facing string (banner, GitHub CTA, composer demo hint,
   sample-question bar label) exists in both `en` and `pt`.
9. **AC9** — `vite build` with `VITE_DEMO_MODE=1` and a `BASE_PATH` produces a bundle whose
   asset URLs are prefixed with `BASE_PATH` (GitHub Pages project-site safe), and a
   `404.html` SPA fallback is emitted alongside `index.html`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — demo replays existing captured `TraceEvent`s.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (no new station).

## Open questions (clarify before planning)

- [x] Online "bring your own key" live path? → **No** (user decision): live stays
  GitHub-local; online is 100% mocked.
- [x] Host? → **GitHub Pages** (user decision).
- [x] Which scenarios must the mock cover? → **Simple + Intermediate** (user decision).

## Out of scope / deferred

- Capturing Advanced-rung traces (rung is non-executing).
- A runtime "demo vs live" switch in one build.
- Auto-recapturing fixtures in CI (manual `scripts/capture_demo_traces` recipe for now).

## Constitution note (amendment)

§2 (single provider required / fail-fast without a key) and §3 (everything is real)
were written for the **live** app. This demo build runs **no provider** and replays
**real captured runs** (not fabricated data), behind a build flag that leaves the live
app untouched. We record this as a scoped carve-out: *"a clearly-labelled `VITE_DEMO_MODE`
build may replay real captured traces with no backend; the default build remains
key-required and fully real."* See `plan.md` and the amendment line in
`.specify/constitution.md`.
