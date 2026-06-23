# Spec: Network appliance detail enrichment (what really happened inside each box)

| | |
|---|---|
| **ID** | 091-network-appliance-detail-enrichment |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The five ingress-appliance drill-ins (089) are too minimalist: a user can't tell
what really happened inside each box. Concretely, from a real run:

- **DNS** — `OUT` is empty (`address`/`ttl` are `null`, nothing stamps them), and
  the `host queried` shows **`modsecurity`** — which is the *next hop* HAProxy
  stamped, not the request's actual resolution. Incoherent and uninformative.
- **CDN** — shows `BYPASS` but **never says why**. The user's question ("was the
  cache used or not, and why?") has no answer on screen. No `age`, no hits, no reason.
- **TLS/LB** — too thin: no pool size, no balancing algorithm, no which backend was
  chosen, no health. HAProxy knows all of this.
- **WAF** — `rules`/`anomaly_score` are `null`; no paranoia level, no threshold, no
  count of rules evaluated. ModSecurity exposes all of it.

The cause is the honesty seam (§2/§3): the drill-in only shows what the forwarded
headers prove, and today the appliances stamp very few headers. The fix must stay
honest — **capture more *real* evidence**, never fabricate — and present it so the
execution is legible.

## Goals

- Make each appliance stamp **more of what it genuinely knows**, so the drill-in
  shows real per-run detail (DNS real IP+TTL; CDN age/hits + bypass reason; LB
  pool/algorithm/chosen backend/health; WAF anomaly/threshold/paranoia/rules).
- **Redesign the drill-in** into a legible **In → appliance → Out** story with a
  short caption per field and an explicit, honest reason when a value is absent or a
  bypass happened ("cache not consulted: POST is uncacheable", "not reported by this
  appliance").
- Add a **reconstructed access-log line** per appliance — formatted like that
  appliance's real log, **built purely from the real evidence** and clearly labelled
  "reconstructed from forwarded evidence" (not a live tail).
- No new `Stage`/`Phase`; additive evidence keys only; default (`network=False`)
  path byte-for-byte unchanged.

## Non-goals

- Shipping real container access logs out of the appliances (a separate, heavier
  log-pipeline decision; explicitly deferred — the log line here is reconstructed).
- Adding real TLS between dev containers, or horizontal scaling (the LB pool stays a
  one-node pool — we show that honestly).
- Per-request server-side timing that only exists as a *response* header (e.g. Kong
  `X-RateLimit-Remaining`, HAProxy `%Tt`) — those can't reach the backend upstream,
  so we keep reporting them honestly absent.

## User-facing behavior

Opening "Open full view" on any of the five edge appliances shows:

1. **What it did** — the one-line role (kept).
2. **In → Out flow** — the inbound evidence, the appliance, and the outbound
   evidence, each row with a small caption explaining the field.
3. **Why** — an honest line when something is absent or bypassed (e.g. DNS "TTL not
   reported by the resolver header", CDN "BYPASS — cache not consulted because POST
   is uncacheable").
4. **Reconstructed log** — one line in the appliance's native log style, labelled as
   reconstructed from the forwarded evidence.
5. **Forwarded headers (verbatim)** — the raw evidence (kept).

All new prose ships in **en + pt**.

## Acceptance criteria

1. **AC1 — DNS shows a real resolution** — With the chain present, the DNS evidence
   carries the real `host`, its resolved `address` and `ttl` (from a real query to
   the running CoreDNS), and the drill-in `OUT` renders address + TTL. The `host`
   is the resolved name, not a downstream hop's name.
2. **AC2 — CDN explains the outcome** — The CDN evidence carries `hits` and a
   `reason`; for the uncacheable `POST /api/chat` the drill-in shows `BYPASS`,
   `hits: 0`, and the reason "uncacheable method (POST)".
3. **AC3 — LB shows the pool** — The LB evidence carries `pool_size`, `algorithm`
   and the chosen `backend`; the drill-in renders e.g. "1 / 1 backends · roundrobin
   · chose modsecurity".
4. **AC4 — WAF shows the verdict detail** — The WAF evidence carries the real
   config facts `threshold` and `paranoia` (stamped by Kong, the hop past the WAF,
   matching the ModSecurity env); the drill-in renders e.g. "clean · PL1 · threshold
   5". The per-request `anomaly_score`/`rules` are **honestly "not measured here"**
   (ModSecurity v3 can't forward its runtime score upstream as a header — noted, not
   faked).
5. **AC5 — reconstructed log line** — Each appliance drill-in renders a single log
   line in that appliance's style, built only from the evidence keys, under a label
   that marks it "reconstructed from forwarded evidence" (en + pt).
6. **AC6 — honest absence** — When a value is `null` or a bypass occurred, the
   drill-in shows an explicit reason rather than a bare `null`; with the chain absent
   the box still shows the honest empty state and fabricates nothing (§3).
7. **AC7 — additive + default unchanged** — No new `Stage`; the new keys are
   additive on the existing appliance `data`; `events.ts` mirrors them; with
   `network=False` no ingress stages fire and the layout is unchanged.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Additive evidence keys on the existing
  `dns`/`cdn`/`waf`/`lb`/`apigw` event `data`.
- Mirror in `frontend/src/types/events.ts`: **required** — extend
  `DnsData`/`CdnData`/`WafData`/`LbData`/`ApiGwData` with the new optional fields.
- Station mapping in `stations.ts`: unchanged.

## Open questions (clarify before planning)

- (resolved) How far to enrich? → capture more **real evidence** + redesign the view.
- (resolved) Logs? → a **reconstructed** log line from the real evidence (labelled),
  not a live container tail.
- (decision in plan) DNS real resolution mechanism: the backend issues a real query
  to CoreDNS for the upstream name (gated by the chain being present); labelled as a
  representative resolution. Confirm dependency choice (`dnspython`) in the plan.

## Out of scope / deferred

- A real log-shipping path from the containers (deferred; the reconstructed line
  covers the pedagogical need without new infra).
- Geo-distributed CDN PoPs / multi-node LB fleets (still a single edge cache / one
  upstream — shown honestly).
