# Plan: Network appliance detail enrichment

> The HOW. Respects `.specify/constitution.md`. No new Stage; no provider change.

## Approach

Three honest levers, applied per appliance:

1. **Stamp more real evidence** — each container emits more of what it truly knows,
   as additive forwarded-header keys parsed in `network.py`. Nothing is invented; a
   value the appliance can't prove stays `null` and the UI says why.
2. **Redesign the drill-in** (`NetworkApplianceDetail`) — an In → appliance → Out
   flow, a caption per field, an honest "why absent/bypass" line, and a reconstructed
   log line. Pure projection of the cursor slice (step/replay safe).
3. **Reconstructed log line** — a pure builder (`buildApplianceLog`) turns the real
   evidence into one line in that appliance's native log format, labelled as
   reconstructed (not a live tail).

### Per-appliance real evidence

- **DNS** — fix the incoherent "host = next hop". The backend issues a **real DNS
  query to the running CoreDNS** (172.28.0.53) for the chain's upstream name and
  reports `host → address (+ ttl)`. Gated by the chain being present
  (`network_available`); on failure/timeout it reports the honest "not resolved"
  state. Adds `dnspython` (TTL isn't available via `socket.getaddrinfo`).
- **CDN (Varnish)** — stamp `X-Cache-Hits` (`obj.hits`) and `X-Cache-Reason`
  (`uncacheable method (POST)` on the pass path; `cacheable` otherwise). `age` from
  the existing `Age` header.
- **LB (HAProxy)** — stamp `X-Lb-Pool-Size` (server count), `X-Lb-Algorithm`
  (`roundrobin`), `X-Lb-Backend` (chosen server name, via `%[srv_name]`).
- **WAF (ModSecurity/CRS)** — ModSecurity v3 has **no action to forward its runtime
  anomaly score upstream as a request header** (and nginx doesn't expose the TX
  score), so we do **not** fake a rule. Instead **Kong** (the hop past the WAF, which
  already attests `X-Waf-Status:clean`) stamps the WAF's real config facts —
  `X-Waf-Paranoia:1` and `X-Waf-Threshold:5` (matching the modsecurity service env /
  CRS default). The per-request `anomaly_score`/`rules` stay `null`, rendered as
  "not measured here" with a one-line honest caveat. No `infra/modsecurity/` rule
  file and no extra compose volume.
- **API-GW (Kong)** — stamp a static `X-Gateway-Policy` (`rate-limit: 60/min`) via
  the request-transformer so the policy is visible (the live remaining count stays a
  response header, still honestly absent upstream).

## Affected files

**Backend**
- `backend/app/network.py` — extend the five `*Info` dataclasses + `read_*`
  parsers + `as_data()` with the new fields; add `resolve_dns(host)` (real CoreDNS
  query via `dnspython`, bounded timeout, honest fallback).
- `backend/app/main.py` — when the chain is on, resolve the upstream name once and
  fold the real `address`/`ttl` into the `dns` evidence emitted.
- `backend/requirements.txt` — add `dnspython`.

**Infra (real evidence — §2)**
- `infra/varnish/default.vcl` — stamp `X-Cache-Hits`, `X-Cache-Reason`.
- `infra/haproxy/haproxy.cfg` — stamp `X-Lb-Pool-Size`, `X-Lb-Algorithm`,
  `X-Lb-Backend`; add `balance roundrobin`.
- `infra/kong/kong.yml` — add `X-Waf-Paranoia`, `X-Waf-Threshold` (WAF config
  attestation) and `X-Gateway-Policy` to the request-transformer. (No
  `infra/modsecurity/` rule / compose volume — see the WAF note above.)

**Frontend**
- `frontend/src/types/events.ts` — mirror the new optional fields on
  `DnsData`/`CdnData`/`WafData`/`LbData`/`ApiGwData`.
- `frontend/src/lib/networkLog.ts` (new) — `buildApplianceLog(kind, data)`: pure,
  returns one reconstructed log line per appliance. Unit-tested.
- `frontend/src/components/NetworkApplianceDetail.tsx` — redesign: In→Out flow with
  per-field captions, the "why absent/bypass" line, the reconstructed-log block.
- `frontend/src/lib/stationDetail.ts` — selectors already return the typed data; no
  change beyond the wider types.
- `frontend/src/i18n/strings.ts` — new captions, the reconstructed-log label, the
  why-absent/why-bypass strings (en + pt).

## Protocol changes (constitution §1)

No `Stage`/`Phase`/`TraceEvent` shape change. Additive `data` keys on existing
appliance events; mirrored as **optional** fields in `events.ts` so older traces
(and the demo fixtures) still type-check and render (missing → "not reported").

## Data model changes

None (no Chroma / SQLite change).

## i18n strings (constitution §4)

New keys under `networkDetail` (per appliance: field captions + a `why`/`reason`
map + the `reconstructedLog` label). All en + pt. (Exact wording in code.)

| key | en | pt |
|---|---|---|
| `networkDetail.reconstructedLog` | Reconstructed from forwarded evidence | Reconstruída a partir da evidência encaminhada |
| `networkDetail.cdn.bypassReason` | BYPASS — cache not consulted: POST is uncacheable | BYPASS — cache não consultado: POST é não-cacheável |
| `networkDetail.dns.ttlAbsent` | TTL not reported by the resolver | TTL não reportado pelo resolver |
| `networkDetail.lb.pool` (fn) | {n}/{m} backends · {algo} · chose {srv} | {n}/{m} backends · {algo} · escolheu {srv} |
| `networkDetail.waf.verdict` (fn) | clean · anomaly {a}/{t} · PL{p} · {r} rules matched | limpo · anomalia {a}/{t} · PL{p} · {r} regras casadas |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 DNS real resolution | `read_dns` surfaces address+ttl; `resolve_dns` returns a real A-record vs honest fallback | `backend/tests/test_network.py` |
| AC2 CDN reason/hits | `read_cdn` surfaces `reason`/`hits`; varnish config-audit stamps them | `backend/tests/test_network.py` |
| AC3 LB pool | `read_lb` surfaces `pool_size`/`algorithm`/`backend`; haproxy config-audit | `backend/tests/test_network.py` |
| AC4 WAF detail | `read_waf` surfaces `anomaly`/`threshold`/`paranoia`/`rules`; modsecurity rule config-audit | `backend/tests/test_network.py` |
| AC5 reconstructed log | `buildApplianceLog` returns the right line per kind from evidence | `frontend/src/lib/networkLog.test.ts` |
| AC6 honest absence | drill-in renders a reason when a field is null / on bypass; empty state when unseen | `frontend/src/components/NetworkApplianceDetail.test.tsx` |
| AC7 additive/default | new fields optional in `events.ts`; `network=False` emits no ingress stages | existing `test_network.py` + FE types |

Structural assertions throughout. The infra header-stamping is pinned by
**config-audit** tests (CI doesn't run Docker), consistent with 088/090.
`resolve_dns` is tested with a real query when CoreDNS is reachable and asserts the
honest fallback shape otherwise (no network dependency in CI).

## Risks / trade-offs

- **Backend DNS query per request** (chain on): bounded timeout + cached + honest
  fallback so it never blocks the pipeline; gated by `network_available`. New dep
  `dnspython` (pure-Python, light).
- **ModSecurity rule file**: depends on the CRS image honoring a mounted custom
  rule; verified by config-audit + a `docker compose up` smoke check (manual, since
  CI has no Docker). If a TX var isn't exposable as a header, that field degrades to
  the honest "not reported" — no fabrication.
- **HAProxy `%[srv_name]`**: a request-time sample fetch of the chosen server; if a
  version lacks it, fall back to the static pool info (size + algorithm).
- The reconstructed log line must never be mistaken for a real tail — it is always
  rendered under the explicit "reconstructed from forwarded evidence" label.
