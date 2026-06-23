# Integration suite (black-box, against the live Docker stack)

These tests are the **release regression net**. They run real end-to-end agent
scenarios *through the real ingress chain* — every request crosses the front door
(Varnish, `:8090`) → HAProxy (TLS/LB) → ModSecurity (WAF) → Kong (API-GW) →
backend, then the LangGraph agent answers against real OpenAI. Unlike the
in-process tests, nothing here imports application code: they assert only on the
bytes that came back over the wire.

They are **opt-in** (`-m integration`) and excluded from the default `pytest -q`
run, because they need the full stack up.

## Run locally

```bash
# 1) Bring up the chain + backend (needs OPENAI_API_KEY in your env / .env)
OPENAI_API_KEY=sk-... docker compose up -d --build backend coredns varnish haproxy modsecurity kong

# 2) Run the suite (the live_stack fixture waits for health first)
cd backend && pytest tests/integration -m integration

# 3) Tear down
docker compose down -v
```

Point the suite at a different entry point with `CHAIN_BASE_URL`
(default `http://localhost:8090`, the chain's front door).

## Run on GitHub Actions

Manually, via the **Integration (live stack)** workflow
(`.github/workflows/integration.yml`) — *Actions → Integration (live stack) →
Run workflow*. It needs the `OPENAI_API_KEY` repository secret. Trigger it before
publishing to `main`.

## Adding a scenario

Add a `@pytest.mark.integration` test that POSTs through `base_url` (use the
`_chat`/`stream_chat` helpers) and asserts **structurally** — stages fired, a tool
was used, the answer is non-empty, the real chain stamped its evidence — never on
the model's exact words, so the suite never goes flaky on model variability.
