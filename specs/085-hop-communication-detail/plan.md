# Plan: Hop communication detail (click an edge → Inspector)

> The HOW. FE-only, pure projection. No backend / protocol change.

## Approach

Make edges selectable. Add a `selectedHop: string | null` to the simulator store (the hop id is the
same `"${source}-${target}"` FlowCanvas already uses for edges), with a `selectHop(id)` action that
is **mutually exclusive** with the station `selected` / `tracesOpen` / `detail` state. `FlowCanvas`
wires React Flow's `onEdgeClick` to `selectHop` and clears it on pane click / station click; the
selected edge gets a subtle highlight.

A new pure selector `lib/hopDetail.ts::deriveHopData(source, target, events)` projects the trace
into the **real data that crossed that hop** as a small discriminated union (`request` | `edge` |
`sql` | `rag` | `mcp` | `llm` | `none`). It reads only existing event `data` (request body, EdgeData,
079 queries, rag.retrieve chunks, mcp.call frames, llm.prompt PromptPreview + usage) — no new Stage.
Labels stay out of the lib (i18n lives in the component), so the selector is trivially testable.

The Inspector renders a **hop-detail branch** when `selectedHop` is set (before the station branch):
header `source → target`, the theory rows (protocol/comm/zone/controls/detail) reusing the existing
hop meta from `hopsFor`, then the "On this run" block driven by `deriveHopData`. The
`frontend → edge` hop additionally renders the **edge chain pipeline** (a small presentational
component: vertical segments DNS·CDN·WAF·TLS/LB·API GW, TLS/LB solid/accent + real value, the rest
dashed/muted + a "preview" tag). The Network Edge inline ⊕ box (`StationNode.innerRows` case `edge`)
is simplified to a couple of rows (proxied/scheme) — the chain no longer lives there.

**Alternatives considered:** a pinned popover on the edge (less room, new stacking issues) and a
dedicated overlay (heavier, redundant with the Inspector). The Inspector reuses the panel users
already know and has room for the real data.

## Affected files

**Frontend**
- `frontend/src/store/useSimulator.ts` — add `selectedHop` + `selectHop(id, {reveal})`; clear it in
  `select`, `openTraces`, `openDetail`, `reset`, and on pane click; clear `selected`/`tracesOpen`
  when a hop is selected.
- `frontend/src/components/FlowCanvas.tsx` — `onEdgeClick` → `selectHop`; pane/station click clears
  it; mark the selected edge (`data.selected`) for highlight.
- `frontend/src/components/edges/FlowEdge.tsx` — read `data.selected` for a highlighted stroke; the
  existing wide hit-path already makes the edge clickable (cursor → pointer).
- `frontend/src/lib/hopDetail.ts` *(new)* — `HopRunData` union + `deriveHopData` + the edge-chain
  segment builder.
- `frontend/src/components/InspectorPanel.tsx` — render the hop detail when `selectedHop` is set
  (header + theory + "On this run" + edge chain); a small `HopDetail`/`EdgeChain` presentational
  helper.
- `frontend/src/components/nodes/StationNode.tsx` — simplify `innerRows` case `"edge"` (drop the
  5-row chain; keep proxied/scheme).
- `frontend/src/i18n/strings.ts` — new inspector strings (`onThisRun`, `noHopData`, `hopChain`,
  `forwardedHeaders`, segment `preview`/`direct` markers as needed), en + pt.

## Protocol changes (constitution §1)

None. No `schemas.py` / `events.ts` change, no new `Stage`. The `STAGE_TO_STATION` /
`STAGE_TO_PHASE` parity and schema-mirror tests are untouched.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `inspector.onThisRun` | On this run | Nesta execução |
| `inspector.noHopData` | Nothing crossed this hop on this run. | Nada cruzou este hop nesta execução. |
| `inspector.hopChain` | Edge chain | Cadeia da borda |
| `inspector.hopRequestBody` | Request | Requisição |
| `inspector.hopAnswer` | Answer | Resposta |
| `inspector.hopForwarded` | Forwarded headers | Headers de encaminhamento |
| `inspector.hopQueries` | SQL statements | Comandos SQL |
| `inspector.hopChunks` | Retrieved chunks | Trechos recuperados |
| `inspector.hopToolCalls` | Tool calls | Chamadas de ferramenta |
| `inspector.hopPrompt` | Assembled prompt | Prompt montado |
| (segment markers reuse 084's `edgePreview` / readout `edgeDirect`) | preview / direct | prévia / direto |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC2 | `deriveHopData` per hop returns the right kind + real fields; empty hop → `none`; pure/deterministic | `frontend/src/lib/hopDetail.test.ts` |
| AC1 | store: `selectHop` sets the hop + clears station/traces; `select` clears the hop | `frontend/src/store/useSimulator.*.test.ts` (new cases) |
| AC4 | edge chain segments: TLS/LB real vs DNS/CDN/WAF/API-GW preview, from edge data | `frontend/src/lib/hopDetail.test.ts` |
| AC3/AC4 | Inspector renders hop detail + chain; empty-state note (component test) | `frontend/src/components/InspectorPanel.hop.test.tsx` (new) |
| AC5 | existing schema-mirror + phases parity unchanged | (already green; run suite) |
| AC6 | new strings present en + pt | `frontend/src/i18n/strings.test.ts` (parity already enforced) |

## Risks / trade-offs

- **Selection coherence:** four selection-ish states (station / hop / traces / detail) must stay
  mutually exclusive — covered by store tests.
- **Determinism:** `deriveHopData` asserts structurally (kinds/lengths/keys), not exact IPs/scores.
- **Replay:** the hop detail must read the same `events` the Inspector already uses (cursor-bounded),
  so step/replay shows the hop's data as of the cursor — no separate fetch.
- **Demo (058):** older captured fixtures lack `edge` events → the edge hop shows the empty-state /
  preview chain gracefully (no crash).
