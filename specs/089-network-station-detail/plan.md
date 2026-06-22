# Plan: Network-edge station full-view drill-ins

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Pure-projection, frontend-only, mirroring 076-station-full-views exactly. The
five network stages already emit typed `data` (088), and `events.ts` already has
`DnsData`/`CdnData`/`WafData`/`LbData`/`ApiGwData`. So the work is the same three
moving parts the existing real-station drill-ins use, applied five times:

1. **Selectors** — add `selectDns/selectCdn/selectWaf/selectLb/selectApiGw` to
   `lib/stationDetail.ts`, each `pickLast(events, "<stage>", "end")` → a typed
   `{ seen, …fields }` object (reuse the existing `*Data` interfaces from
   `events.ts`). `seen` (or no event) drives the empty state.
2. **Overlays** — one component per appliance using the shared `DetailShell` +
   `Section`/`KeyVal`/`Mono`/`Scroll` primitives. Each renders an **In → Out**
   pair of `Section`s built from the typed fields, plus a `Scroll` of the raw
   `data` (verbatim evidence, kept for honesty). Empty state via
   `DetailShell`'s `empty`/`emptyText`. To avoid five near-identical files,
   factor a small shared `NetworkApplianceDetail` shell that takes the accent,
   icon, i18n bundle, the `seen` flag and the In/Out rows — each of the five is a
   thin wrapper that calls its selector and supplies its rows. (Decision: one
   shared component parameterised by appliance, *not* five copy-pasted files —
   keeps the In→Out layout in one place.)
3. **Wiring** —
   - `HAS_DETAIL` in `StationNode.tsx`: add `dns/cdn/waf/lb/apigw: true` so the
     "Open full view" button renders on each node. The button label falls
     through to `t.node.openFull` (no special-case needed — only rag/pageindex/
     ingestion have custom labels).
   - `App.tsx`: add `{detail === "dns" && <NetworkApplianceDetail kind="dns" …/>}`
     … for all five, beside the existing overlays.
   - The store already supports any `StationId` in `detail`; `openDetail` already
     does the right thing. No store change.

The Inspector's existing `dns/cdn/waf/lb/apigw` case in `renderDetail`
(the `forwardedEvidence` JSON `Scroll`) **stays as-is** (AC6: theory view
unchanged; the raw JSON there is harmless and complementary). We are *adding* the
full-view, not moving the inspector content.

### Reverse-proxy labelling (AC5)

The TLS/LB overlay's In→Out copy and a one-line role caption name it the reverse
proxy ("Reverse proxy · terminate TLS · forward to upstream"). Lives in the `lb`
slice of the new i18n bundle, en + pt.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/stationDetail.ts` — add `selectDns/selectCdn/selectWaf/
  selectLb/selectApiGw` (+ their return-type interfaces, or reuse `*Data`).
- `frontend/src/components/NetworkApplianceDetail.tsx` — **new**. Shared overlay
  parameterised by appliance `kind`; reads store `events`+`cursor`, calls the
  matching selector, renders In→Out + raw evidence via `DetailShell`.
- `frontend/src/components/nodes/StationNode.tsx` — add the five ids to
  `HAS_DETAIL`.
- `frontend/src/App.tsx` — render the overlay for `detail ∈ {dns,cdn,waf,lb,
  apigw}`.
- `frontend/src/i18n/strings.ts` — new `networkDetail` bundle (per-appliance
  title/subtitle/back/empty + In/Out field labels + the reverse-proxy line), en
  + pt, plus the type in the `Strings` interface.
- Tests: `frontend/src/lib/stationDetail.test.ts` (or a new
  `networkDetail.test.ts`) for the selectors; a component test for the overlay
  render + empty state; a `StationNode`/wiring test for the button + toggle.

## Protocol changes (constitution §1)

None. No `schemas.py` / `events.ts` / `stations.ts` / `STAGE_TO_*` change — the
stages, their station mapping, and their phase mapping all already exist (088).
`readoutFor`/`renderDetail` already have the network cases. (No new `StationId`,
so the exhaustive `StationId` switches are untouched.)

## Data model changes

None — no Chroma, no SQLite, no migration.

## i18n strings (constitution §4)

New `networkDetail` bundle. Representative entries (full set filled at
implementation; every key gets en + pt):

| key / location | en | pt |
|---|---|---|
| `networkDetail.dns.title` | DNS | DNS |
| `networkDetail.dns.subtitle` | Name resolution | Resolução de nomes |
| `networkDetail.in` | In | Entrada |
| `networkDetail.out` | Out | Saída |
| `networkDetail.back` | Back | Voltar |
| `networkDetail.dns.empty` | No DNS resolution in front of this request. | Sem resolução DNS na frente desta requisição. |
| `networkDetail.dns.host` | Host queried | Host consultado |
| `networkDetail.dns.address` | Resolved address | Endereço resolvido |
| `networkDetail.dns.ttl` | TTL (s) | TTL (s) |
| `networkDetail.cdn.cache` | Cache | Cache |
| `networkDetail.waf.status` | Verdict | Veredito |
| `networkDetail.lb.role` | Reverse proxy · terminate TLS · forward to upstream | Proxy reverso · termina TLS · encaminha ao upstream |
| `networkDetail.lb.upstream` | Upstream | Upstream |
| `networkDetail.apigw.route` | Route | Rota |
| `networkDetail.evidence` | Forwarded headers (verbatim) | Cabeçalhos encaminhados (verbatim) |
| … (cdn.age/server, waf.rules/anomaly/engine, lb.tls/scheme/server, apigw.rateLimit/upstreamLatency/gateway) | | |

(`forwardedEvidence` already exists in `inspector` strings — reuse it for the
raw section title if convenient.)

## Cloud map (constitution §5)

n/a — no new tier/station. The five stations already carry their `clouds` map
from 088.

## Test strategy (constitution §9 — TDD)

Red → green, structural assertions (tolerate exact prose).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `selectDns` returns host/address/ttl from a `seen:true` event | `frontend/src/lib/stationDetail.test.ts` |
| AC2 | `selectCdn/Waf/Lb/ApiGw` each surface their typed fields | `…stationDetail.test.ts` |
| AC3 | `seen:false` / missing event → `seen:false` (empty) for each selector | `…stationDetail.test.ts` |
| AC4 | network ids present in `HAS_DETAIL`; clicking the node button calls `openDetail(id)`; second click closes | `…StationNode.test.tsx` (or a wiring test) |
| AC5 | rendered LB overlay contains the reverse-proxy label (en + pt) | `frontend/src/components/NetworkApplianceDetail.test.tsx` |
| AC6 | Inspector `renderDetail` still renders for a network station (unchanged) | existing `InspectorPanel` test stays green |
| AC7 | i18n parity: every `networkDetail` key exists in pt (covered by the existing strings parity test if present, else a key-set assertion) | i18n test |
| AC8 | overlay reads cursor slice → empty before the event's cursor | `NetworkApplianceDetail.test.tsx` |

## Risks / trade-offs

- **Low risk**: additive, frontend-only, no protocol/geometry change; the
  failure mode is a missing string or an unwired `detail` case, both caught by
  `tsc` + Vitest.
- **Shared-component vs five files**: the shared `NetworkApplianceDetail`
  keeps the In→Out layout in one place at the cost of a `kind`-keyed config map;
  acceptable and more maintainable than five copies.
- **Determinism**: selectors are pure over the visible slice (same contract as
  `selectFrontend`), so step/replay parity is free (AC8).
- **Honesty (constitution §3)**: when `seen:false` we must show the "not in
  front" state, never fabricated values — the selector returning `seen` makes
  this explicit.
