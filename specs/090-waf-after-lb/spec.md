# Spec: WAF after the load balancer (single TLS termination) + honest CDN bypass

| | |
|---|---|
| **ID** | 090-waf-after-lb |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The 088 ingress chain models the request transit order as
**DNS → CDN → WAF → TLS/LB → API-GW → backend**. A flow review surfaced two
honesty problems in that story:

1. **The TLS is "terminated" twice.** A Web Application Firewall inspects **L7
   (HTTP)** content, so it needs the request already **decrypted**. In the current
   model the `cdn→waf` hop is plain HTTP (so TLS already terminated at the CDN),
   yet the *later* `waf→lb` hop is labelled HTTPS and says *"TLS is terminated
   here"*. Two hops claim to terminate TLS, and the WAF is drawn **before** the
   stated termination point — which is physically impossible (a WAF can't read an
   encrypted body). This misleads a learner about where decryption happens.

2. **The CDN "MISS" is misleading.** `POST /api/chat` is a dynamic, **uncacheable**
   request: it is never a cache lookup that happened to miss — it is a method-based
   **bypass**, so it *always* skips the cache. Labelling it `MISS` implies a cache
   probe that could otherwise have been a HIT, which is false for this endpoint.

This spec fixes both, keeping the visualizer's promise that **everything shown is
real** (constitution §2): the fix is applied at the source — the real ingress
container chain is reordered to match, not just the picture.

## Goals

- Move the WAF to **after** the load balancer so it inspects already-decrypted
  HTTP, making **the LB the single TLS-termination point** (solution B, chosen by
  the user). New transit order: **DNS → CDN → TLS/LB → WAF → API-GW → backend**.
- Keep the real 5-container ingress chain honest: reorder the actual containers and
  move the "WAF-cleared" attestation to a component **downstream** of the WAF.
- Report the CDN cache decision for the uncacheable chat API honestly as a
  **bypass** (uncacheable pass-through), not a cache `MISS`.
- No new `Stage`/`Phase`/`TraceEvent`; the default (`network=False`) path stays
  byte-for-byte unchanged.

## Non-goals

- Adding real TLS between dev containers (the local chain stays HTTP; "TLS
  termination" remains the production story a single hop tells).
- Changing the API gateway, DNS or storage behaviour.
- Caching the chat API (it stays correctly uncacheable).
- Re-litigating solution A (terminate at the CDN); the user picked B.

## User-facing behavior

On the canvas, with the network component on, the public **Network Edge** column
renders the appliances top-to-bottom as **DNS · CDN · TLS/LB · WAF · API-GW**
(WAF now sits between the load balancer and the gateway). The arrows read:

- `CDN → TLS/LB`: **HTTPS / TLS 1.3** (still encrypted up to the LB).
- `TLS/LB → WAF`: **HTTP** (decrypted by the LB — the single termination point).
- `WAF → API-GW`: **HTTP** (clean traffic continues; attacks were 403'd at the WAF).

The CDN tile, for a chat request, reads **`BYPASS`** (uncacheable) instead of
`MISS`, and the CDN prose explains that the dynamic API is never cached, so it
always passes straight through the chain. All edited prose ships in **en + pt**.

## Acceptance criteria

1. **AC1 — emission order** — A `/api/chat` run with the chain present emits the
   five ingress stages in transit order **DNS → CDN → LB → WAF → APIGW** (LB before
   WAF), before the `BACKEND` stage.
2. **AC2 — visual wiring** — `stations.ts` hops connect `cdn→lb`, `lb→waf` and
   `waf→apigw`; there is **no** `cdn→waf` or `waf→lb` hop. `layout.ts` orders the
   edge column `dns, cdn, lb, waf, apigw`.
3. **AC3 — single TLS termination** — The `cdn→lb` hop protocol is **HTTPS / TLS
   1.3** and the `lb→waf` hop protocol is plain **HTTP**; **only the LB hop's prose
   mentions terminating TLS** — no hop after the CDN re-claims TLS termination.
4. **AC4 — real chain reordered & WAF attestation honest** — The real container
   chain forwards in the order `varnish → haproxy → modsecurity → kong → backend`,
   and the `X-Waf-Status` ("WAF cleared") evidence is stamped by a component
   **downstream** of ModSecurity (Kong), never by HAProxy (now upstream of the WAF).
5. **AC5 — honest CDN bypass** — For the uncacheable chat API, Varnish stamps the
   cache decision as **`BYPASS`**; `read_cdn` surfaces it and the CDN tile readout
   shows `BYPASS` (not `MISS`). The CDN prose explains the uncacheable pass-through.
6. **AC6 — default path unchanged** — With `network=False` (default), no ingress
   stages are emitted and the canvas layout is byte-for-byte unchanged.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — only the emission **order** and hop wiring
  change. `DNS`/`CDN`/`WAF`/`LB`/`APIGW` already exist.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no schema change).
- Station it maps to in `stations.ts`: unchanged (`dns`/`cdn`/`waf`/`lb`/`apigw`
  already map to the `edge` tier).

## Open questions (clarify before planning)

- (resolved) Solution A vs B → **B** (terminate at LB, WAF after it). User decision.
- (resolved) Reorder the real containers too? → **Yes** — §2 honesty requires the
  picture to match the real transit order.

## Out of scope / deferred

- Modelling a CDN-edge WAF (WAF co-located at the CDN, solution A flavour).
- Echoing Kong's live `X-RateLimit-Remaining` upstream (still a response header).
