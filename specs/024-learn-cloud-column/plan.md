# Plan: Cloud-aware Learn map — "Build on {cloud}" column

> The HOW. Respects every principle in `.specify/constitution.md`. No protocol change,
> no new Stage — this is Learn-page rendering + the cloud toggle's icons only
> (constitution §1/§6 untouched; §5 reused read-only).

## Approach

Two coordinated pieces, both additive:

1. **A pure `cloudGuideFor(cloud, lang)` resolver** in `frontend/src/learn/content.ts`. A small
   curated, ordered table `CLOUD_GUIDE_SRC` declares the end-to-end layers of *this* system as
   `{ label: Tr; ref; topicId }`, where `ref` is an existing station/tier/boundary id and
   `topicId` is an existing Learn topic id. The resolver borrows the per-cloud service name
   straight from `stations.ts` via the **same `cloudElementFor` + `cloudValue` path** spec 023
   already uses (so service names are never duplicated), returns `[]` for `generic`, and drops
   any entry whose `ref` resolves but yields an empty service. This keeps AC1–AC3 testable with
   zero React.

2. **Render the column on the Learn map.** `LearnMap.buildGraph` becomes
   `buildGraph(selected, sections, cloud, lang)` — a **pure function** (returns React Flow
   `nodes`/`edges`), so AC4 is unit-testable. When `cloud !== "generic"` it appends one extra
   column: a `cloud-col` header node (provider brand icon + `t.learn.onCloud(label)` + hint) and
   one `cloud:{topicId}` node per guide entry (namespaced ids so they never collide with the
   real topic nodes already in the graph). `onNodeClick` maps a `cloud:*` click back to the real
   `topicId` and calls `onSelect`, opening the existing topic detail (spec-023 cloud block).

3. **Brand icons.** A new `frontend/src/lib/cloudIcons.tsx` exports an inline-SVG component per
   provider and a `CLOUD_ICONS: Record<CloudId, IconComponent>` map (+ a `CLOUD_ACCENT` color per
   cloud for the column). `cloud.ts` drops the emoji `icon` field from `CLOUDS`; `CloudToggle`
   and the new header node consume `CLOUD_ICONS[code]`. Generic keeps a neutral cloud glyph.

Alternatives considered (rejected, see spec clarify): a sidebar panel (less "a new group", map
stays static) and per-node badges (only `cloudRef` topics react, nodes get busy). The new
column is the most faithful to the request and reuses the existing map machinery.

## Affected files

**Backend**
- _None._ Frontend-only; no schema, route, agent, RAG, MCP or DB change.

**Frontend**
- `frontend/src/lib/cloudIcons.tsx` — **new**: `GenericIcon`/`AzureIcon`/`AwsIcon`/`GcpIcon`
  inline SVGs (official brand marks), `CLOUD_ICONS` + `CLOUD_ACCENT` maps.
- `frontend/src/lib/cloud.ts` — drop the emoji `icon` from `CLOUDS` (keep `code`, `label`).
- `frontend/src/components/CloudToggle.tsx` — render `CLOUD_ICONS[code]` instead of the emoji.
- `frontend/src/learn/content.ts` — add `CloudGuideEntry`, `CLOUD_GUIDE_SRC`, `cloudGuideFor()`
  (reuses the existing `cloudElementFor` + `cloudValue`).
- `frontend/src/learn/LearnMap.tsx` — make `buildGraph` cloud/lang-aware + pure & exported;
  subscribe to `useCloud`; map `cloud:*` clicks back to the topic id; register the new node type.
- `frontend/src/learn/LearnNodes.tsx` — add `CloudSectionNode` (brand icon + title + hint) and
  `CloudTopicNode` (layer label + concrete service), reusing the existing node styling.
- `frontend/src/i18n/strings.ts` — add `learn.cloudGuideHint(label)` in `en` + `pt` (and the
  `Strings` interface). Reuse the existing `learn.onCloud(label)` for the column title.
- `frontend/src/learn/cloudColumn.test.ts` — **new** test file (AC1–AC5).
- `frontend/src/i18n/strings.test.ts` — extend for the new chrome key (AC6).

## Content model changes (content.ts)

```ts
export interface CloudGuideEntry { label: string; service: string; topicId: string }
type CloudGuideSrc = { label: Tr; ref: string; topicId: string };

// Curated, ordered end-to-end layers of THIS system. ref → stations.ts element
// (borrow clouds{}); topicId → an existing Learn topic to open on click.
const CLOUD_GUIDE_SRC: CloudGuideSrc[] = [
  { label: {en:"Client",          pt:"Cliente"},        ref: "frontend", topicId: "client-tier" },
  { label: {en:"API",             pt:"API"},            ref: "backend",  topicId: "api-tier" },
  { label: {en:"Agent",           pt:"Agente"},         ref: "agent",    topicId: "agent-tier" },
  { label: {en:"LLM",             pt:"LLM"},            ref: "llm",      topicId: "openai-provider" },
  { label: {en:"Vector DB",       pt:"Banco vetorial"}, ref: "rag",      topicId: "vector-db" },
  { label: {en:"App database",    pt:"Banco da app"},   ref: "database", topicId: "app-db" },
  { label: {en:"MCP tools",       pt:"Ferramentas MCP"},ref: "mcp",      topicId: "tool-calling" },
  { label: {en:"Private network", pt:"Rede privada"},   ref: "vnet",     topicId: "private-net" },
];

export function cloudGuideFor(cloud: CloudId, lang: Lang): CloudGuideEntry[];
// generic → []; else map each entry → { label, service: cloudValue(cloudElementFor(ref), cloud), topicId },
// dropping entries with no resolvable service. Cached per (cloud, lang).
```

All `ref`s exist today (`frontend`, `backend`, `agent`, `llm`, `rag`, `database` stations; `vnet`
boundary) and all `topicId`s exist (`client-tier`, `api-tier`, `agent-tier`, `openai-provider`,
`vector-db`, `app-db`, `tool-calling`, `private-net`) — the AC2 test pins both against the live
model so any rename fails the suite.

## Map rendering (LearnMap / LearnNodes)

- `buildGraph(selected, sections, cloud, lang)` exported & pure. New column at
  `x = sections.length * COL_STEP`; header node id `cloud-col` (type `lcloud`); entry node ids
  `cloud:${topicId}` (type `lcloudtopic`), positioned like topic nodes; dashed edges in the
  cloud accent; an edge from `root` to `cloud-col` to match the sibling sections.
- `onNodeClick`: `lcloudtopic` → `onSelect(node.id.replace(/^cloud:/, ""))`; `lcloud` is inert.
- `CloudSectionNode` renders `<CLOUD_ICONS[cloud] />` + `t.learn.onCloud(label)` + hint, bordered
  in `CLOUD_ACCENT[cloud]`. `CloudTopicNode` renders the layer `label` (muted) over the concrete
  `service` (emphasis).

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent` added or changed; `schemas.py` ↔ `events.ts` untouched;
no `readoutFor`/`renderDetail` case; `STAGE_TO_STATION` / `STAGE_TO_PHASE` unchanged. The column
only *references* existing station/tier/boundary ids for their cloud map (read-only).

## Data model changes

None. No Chroma or SQLite change.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `learn.onCloud(label)` | `On ${label}` | `Em ${label}` | _(reused — already exists)_ |
| `learn.cloudGuideHint(label)` | `Managed services to build this on ${label}` | `Serviços gerenciados para construir isto em ${label}` |

The layer labels (`Client`, `API`, …) live in `CLOUD_GUIDE_SRC` as `Tr` (en+pt). Service names
are proper nouns reused from `stations.ts` — not translated. Brand icon marks carry no text.

## Cloud map (constitution §5)

No new tier/station/boundary, so **no `clouds{}` entry to add**. The column **reuses** the
existing `clouds{}` maps via `ref` + `cloudValue`. The AC2 test asserts every `ref` resolves
against the live `stations.ts`, so a dangling ref fails the suite. **n/a** for new elements.

## Test strategy (constitution §9 — TDD)

Vitest, co-located, all offline (pure content/data — no OpenAI key).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 generic → empty | `cloudGuideFor("generic", l)` is `[]`; `buildGraph(..,"generic",l)` has no `cloud-col`/`cloud:*` | `learn/cloudColumn.test.ts` |
| AC2 services from model | every entry `service === cloudValue(cloudElementFor(ref,l), cloud)` & non-empty; every `ref`/`topicId` resolves | `learn/cloudColumn.test.ts` |
| AC3 bilingual parity | en vs pt guide: same length, same `topicId` order, all `label`s non-empty | `learn/cloudColumn.test.ts` |
| AC4 column rendering | `buildGraph(null,sections,"azure",l)` has `cloud-col` + one `cloud:{id}` per guide entry; ids namespaced; click maps back | `learn/cloudColumn.test.ts` |
| AC5 brand icons | `CLOUD_ICONS[c]` defined & is a component for every `CloudId` | `learn/cloudColumn.test.ts` |
| AC6 i18n chrome | `cloudGuideHint` present in `en` and `pt` | `i18n/strings.test.ts` |

`npm run build` (`tsc --noEmit`) enforces the model/rendering change end-to-end. The brand-icon
**visual fidelity** is verified by running the app and screenshotting the toggle (matching how
the codebase handles purely-visual changes — no pixel test).

## Risks / trade-offs

- **AWS wordmark legibility.** The official simple-icons AWS mark includes the "aws" wordmark,
  which can be mushy at ~16px. Mitigation: verify by screenshot after build; fall back to the
  AWS "smile" mark only if the wordmark doesn't read at toggle size.
- **`ref`/`topicId` drift.** A rename in `stations.ts`/`content.ts` would break the column
  silently — mitigated by AC2 resolving both against the live model (a dangling ref/topic fails
  the suite).
- **Map width.** One extra column widens the graph; React Flow `fitView` already reframes, so no
  layout breakage. No behavior/protocol risk; single-instance and the event contract untouched.
