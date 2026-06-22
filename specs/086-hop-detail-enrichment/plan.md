# Plan: Hop detail enrichment

> FE-only, pure content + a UI affordance. No backend / protocol change.

## Approach

Add an optional bilingual **`why`** field to the hop model (`HopMeta`/`HopSrc` + `resolveHop`) and
author it for every hop in `HOPS_SRC` — the role + the reasoning (why mTLS, why a private endpoint,
what crosses, what would break). The edge hop's `why` frames nginx as a reverse proxy and lists its
roles here + extras. The `HopDetail` (085, in `InspectorPanel`) renders `why` as a "Why this hop"
section under the existing theory.

For discoverability, `FlowEdge` renders a small, always-visible **⊕ expand button** on the edge
label that reads `selectHop` from the simulator store and calls `selectHop(props.id)` — opening the
same hop detail a path click opens. It needs `pointerEvents: "all"` (EdgeLabelRenderer children are
non-interactive by default) and is emphasised on hover/selected.

## Affected files

**Frontend**
- `frontend/src/lib/stations.ts` — `why?: string` on `HopMeta`, `why?: Tr` on `HopSrc`; `resolveHop`
  resolves it; author `why` for all hops in `HOPS_SRC`.
- `frontend/src/components/InspectorPanel.tsx` — `HopDetail` renders `hop.why` (a "Why this hop"
  section) under protocol/detail/controls.
- `frontend/src/components/edges/FlowEdge.tsx` — a ⊕ button on the label → `selectHop(props.id)`
  (read the store), `pointerEvents:"all"`, bilingual title.
- `frontend/src/i18n/strings.ts` — `inspector.hopWhy` + `inspector.hopExpandHint` (en + pt).

## Protocol changes

None.

## i18n strings (constitution §4)

| key | en | pt |
|---|---|---|
| `inspector.hopWhy` | Why this hop | Por que este hop |
| `inspector.hopExpandHint` | Network details | Detalhes de rede |
| hop `why` (×N) | authored per hop in stations.ts | idem |

## Cloud map

n/a.

## Test strategy (TDD)

| AC | Test | File |
|---|---|---|
| AC1 | every hop has a non-empty `why` in en + pt | `frontend/src/lib/stations.test.ts` |
| AC2 | the frontend→backend `why` mentions reverse proxy + TLS/LB + an "also" role | `frontend/src/lib/stations.test.ts` |
| AC1 (render) | hop detail shows the "Why this hop" text | `frontend/src/components/InspectorPanel.hop.test.tsx` |
| AC5 | new strings present en + pt | `frontend/src/i18n/strings.test.ts` (parity) |

The ⊕ button (AC3) is thin wiring inside React Flow's `EdgeLabelRenderer`; covered by `tsc` + the
existing `selectHop` store test + manual check (a full ReactFlow render is out of scope for a unit).

## Risks / trade-offs

- Edge-label clutter: keep the ⊕ small/subtle, emphasise on hover/selected.
- Determinism: tests assert presence/substrings, not exact prose.
