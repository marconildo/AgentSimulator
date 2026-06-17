# Plan: Intermediate preview tiles (light up the rung's tracks)

> The HOW. No principle is bent — both tiles are non-executing `comingSoon` previews
> (§3 is about *execution*), carry no `Stage` (§1 protocol unchanged), and reuse the
> 059 `rag`/`agent` tracks (no new theme). Frontend-only; no backend.

## Approach

Add two `comingSoon` preview stations to `stations.ts`, following the exact pattern
the 008 AI-Ops + sub-agent previews already established (`stages: []`, full bilingual
prose + `clouds`, `scenarios`, `tracks`). `hybrid` joins the data column (tier
`services`); `summarization` joins the Agent tier (tier `agent`). Both are
`scenarios: ["intermediate","advanced"]` so the ladder stays cumulative and the 059
`tracksForScenario` lights the **Intermediate** selector (`rag` + `agent` = 2 themes).

The only non-mechanical part is **layout placement of `summarization`**: the Agent
tier's sub-agent row (`researcher/coder/critic`) is hand-positioned under the agent on
the Advanced rung, so a naïve column member would collide with it. `summarization` is
therefore **hand-positioned too** — below the agent, and below the sub-agent row when
that row is present — mirroring the existing sub-agent special-case. `hybrid` needs no
special-casing: it's a normal data-column member and the column auto-stacks it under
the last visible data node.

## Affected files

**Frontend only.**

- `frontend/src/lib/stations.ts` —
  - extend `StationId` with `"hybrid" | "summarization"`;
  - add the two `StationSrc` entries (full `{en,pt}` prose, `clouds`, `tech`,
    `stages: []`, `comingSoon: true`, `scenarios: ["intermediate","advanced"]`,
    `tracks: ["rag"]` / `["agent"]`, `tier: "services"` / `"agent"`, a placeholder
    `position` — the layout computes the real one);
  - `hybrid` accent `var(--color-ok)` + icon 🔀 (RAG family); `summarization` accent
    `var(--color-pink)` + icon 🗜️ (agent family).
- `frontend/src/lib/layout.ts` —
  - add both ids to `EXPANDED_H` (= `COLLAPSED_H`, preview-only) and `TIER_OF`
    (`services` / `agent`) — both are `Record<StationId,…>`, so `tsc` forces them;
  - add `hybrid` to the data column's `members` (after `llm`);
  - add a `summarization` hand-placement block after the sub-agent row: position it at
    `agent.x`, `y =` (sub-agent row bottom if any sub-agent visible, else agent bottom)
    `+ gap`; width `NODE_WIDTH`. The existing tier-box + boundary math then wraps it.
- `frontend/src/components/FlowCanvas.tsx` — add `hybrid` + `summarization` to the
  `readoutFor` preview group (`return ""`).
- `frontend/src/components/nodes/StationNode.tsx` — add both to the `innerRows`
  preview group (`return []`).
- `frontend/src/i18n/strings.ts` — **no change** (the node prose lives in `stations.ts`;
  the *coming soon* badge string already exists from 008).

**No backend. No `events.ts`. No new tier. No new `Track` value.**

## Protocol changes (constitution §1)

**None.** No `Stage`/`TraceEvent`/`ChatRequest`/`/api/config` change. Two new
`StationId`s force the exhaustive maps/switches (`EXPANDED_H`, `TIER_OF`, `readoutFor`,
`innerRows`) to gain cases — `tsc` enforces it. `renderDetail` stays non-exhaustive
(previews fall through to the *coming soon* banner). `STAGE_TO_STATION` /
`STAGE_TO_PHASE` are derived from `stages` and stay total (previews carry `[]`).

## Data model changes

None.

## i18n strings (constitution §4)

All new prose lives in `stations.ts` as `{en,pt}`:

| node | field | en | pt |
|---|---|---|---|
| hybrid | title | Hybrid Search | Busca Híbrida |
| hybrid | subtitle | BM25 + vector | BM25 + vetorial |
| hybrid | blurb | Combines keyword (BM25) and vector retrieval, fusing both result sets (RRF) to catch exact-term matches embeddings miss. | Combina recuperação por palavra-chave (BM25) e vetorial, fundindo os dois conjuntos (RRF) para pegar correspondências exatas que o embedding perde. |
| hybrid | generic | Hybrid retriever (sparse + dense) | Retriever híbrido (esparso + denso) |
| summarization | title | Summarization | Sumarização |
| summarization | subtitle | Context compaction | Compactação de contexto |
| summarization | blurb | Compacts the running message thread when it grows too long — summarizing old turns so the agent keeps context without blowing the token budget. | Compacta o thread de mensagens quando ele cresce demais — resumindo turnos antigos para o agente manter contexto sem estourar o orçamento de tokens. |
| summarization | generic | Conversation summarization / context compaction | Sumarização de conversa / compactação de contexto |

## Cloud map (constitution §5)

| node | generic | azure | aws | gcp |
|---|---|---|---|---|
| hybrid | Hybrid retriever (sparse + dense) | AI Search (hybrid) | OpenSearch hybrid / Kendra | Vertex AI Search (hybrid) |
| summarization | Conversation summarization | Azure OpenAI (summary calls) | Bedrock (summary calls) | Vertex AI (summary calls) |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | both stations: `comingSoon`, `stages:[]`, `scenarios ⊇ {intermediate,advanced}`, `tracks` correct | `frontend/src/lib/track.test.ts` (extend) |
| AC2 | `tracksForScenario("intermediate") = ["rag","agent"]`; `("simple")` empty | `track.test.ts` |
| AC3 | `visibleStationIdsFor("intermediate")` = Simple ∪ `{hybrid,summarization}`; cumulative chain holds; **update** `scenario.test.ts`'s `inter.size === simple.size` → `simple.size + 2` | `scenario.test.ts` |
| AC4 | intermediate + `track="rag"` ⇒ has `hybrid`, not `summarization`; `"agent"` ⇒ inverse; `"all"` ⇒ both | `track.test.ts` |
| AC5 | Simple set unchanged for every track | `track.test.ts` (the AC2-Simple loop already covers it) |
| AC6 | `STAGE_TO_STATION`/`STAGE_TO_PHASE` total + no stage maps to either preview | `phases.test.ts` (already pins "no live Stage → coming-soon station") |
| AC7 | `computeLayout("intermediate")`: `hybrid` below last data node; `summarization` below agent; `computeLayout("advanced")`: `summarization.y ≥` sub-agent row bottom (no overlap); services + agent tier boxes wrap them | `layout.test.ts` (extend) |
| AC8 | both stations have en+pt prose + full cloud map | `scenario.test.ts`'s existing "every station has prose + cloud map (advanced, showUpload)" loop already covers them |

Also update the 059 `track.test.ts` advanced expectations: `tracksForScenario("advanced")`
now includes `"rag"` (→ `{rag,agent,aiops,security}`), and the cluster assertions add
`hybrid`/`summarization` where relevant. All tests pure Vitest.

## Risks / trade-offs

- **`summarization` layout collision** with the Advanced sub-agent row is the only
  real hazard. Mitigation: hand-position it relative to the sub-agent row bottom (AC7
  pins no-overlap on advanced). Reuses the existing hand-placement pattern, so the
  geometry stays declarative.
- **Advanced selector width** — Advanced now exposes 4 themes (`All · RAG Quality ·
  Agent Design · AI-Ops · Security & Trust` = 5 buttons). The 059 fix already hides the
  cloud toggle on rungs with tracks, freeing room. Verify the header doesn't overflow at
  ~1440–1680px; if it does, shorten the segmented labels (full name stays in the hover
  blurb) — a tasks-level tweak, not a spec change.
- **Roadmap drift** — adding Hybrid as a *tile* (vs the roadmap's "beside rag" note) is
  intentional and consistent with how Advanced previews work; the roadmap already calls
  Hybrid the "beside the rag station" technique, so this honours it. The other
  techniques stay sub-stages.
