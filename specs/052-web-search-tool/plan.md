# Plan: Web search tool (Tavily)

> HOW for `spec.md`. No new `Stage`; `web_search` is a new MCP tool mirrored across
> both transports, exactly like the existing four tools.

## Approach

A new MCP tool `web_search(query)` that calls Tavily through the official
`tavily-python` SDK and returns a synthesized **answer + sources** string. The logic
lives in a plain `_web_search` function in `server.py` (so the in-process fallback in
`client.py` reuses it), registered with `@mcp.tool()` and mirrored as a `RegisteredTool`
in `_load_local()`. The Tavily key is read from settings; absence is handled gracefully
(honest `error:` string, never an exception). The stdio subprocess already inherits the
parent environment (`env=dict(os.environ)` in `_load_via_mcp`), so `TAVILY_API_KEY`
reaches it — same mechanism `load_skill` relies on for `APP_DB_PATH`.

## Affected files

**Backend**
- `backend/requirements.txt` — add `tavily-python`.
- `backend/app/config.py` — add `tavily_api_key: str = ""` to `Settings` + a
  `has_tavily_key` property.
- `backend/.env.example` — document the optional `TAVILY_API_KEY`.
- `backend/app/mcp/server.py` — add `WEB_SEARCH_TOOL` / `WEB_SEARCH_DESCRIPTION`
  constants, the `_web_search(query)` plain function, and the `@mcp.tool() web_search`
  registration.
- `backend/app/mcp/client.py` — mirror `web_search` as a `RegisteredTool` in
  `_load_local()` (name/description/schema/runner) using the server constants.
- `backend/tests/conftest.py` — register a `tavily` marker and skip `@pytest.mark.tavily`
  tests when `TAVILY_API_KEY` is unset (mirrors the `openai` gate).
- `backend/tests/test_web_search.py` — new test module (the failing tests come first).

**Frontend**
- `frontend/src/i18n/strings.ts` — add `web_search` to both `toolLabels` maps
  (`en: "Web search"`, `pt: "Busca na web"`).
- `frontend/src/lib/stations.ts` — append `web_search` to the MCP station's `tech`
  "tools" listing (cosmetic content; both languages share the same value string).

## `_web_search` behavior (contract)

```
_web_search(query: str) -> str
  - key = get_settings().tavily_api_key; if blank → return
      "error: web search is unavailable — TAVILY_API_KEY is not configured"
  - else: TavilyClient(api_key=key).search(query, max_results=5, include_answer=True)
      answer  = result.get("answer")
      results = result.get("results", [])  # [{title,url,content}, ...]
      compose: optional "Answer: <answer>\n\n" + "Sources:\n" + numbered
               "<n>. <title> — <url>\n   <snippet>" lines (snippet trimmed)
      if nothing came back → "No web results found for '<query>'."
  - any exception → f"error: {exc}"   (never propagates; model reads the text)
```
Import `TavilyClient` lazily *inside* the function so importing `server.py` (and the
keyless guard tests) never requires the package to be installed/configured.

## Protocol / i18n / cloud impact

- **Protocol:** none — no `Stage`/`Phase`/`TraceEvent` change; the two exhaustive
  `STAGE_TO_STATION` / `STAGE_TO_PHASE` maps are untouched.
- **i18n:** one new bilingual label (`toolLabels.web_search`) in en + pt (§4).
- **Cloud:** none — no new tier/station/boundary; the existing `mcp` station already
  carries its `clouds` map.

## Test strategy (AC → test)

| AC | Test (in `backend/tests/test_web_search.py` unless noted) |
|----|-----------------------------------------------------------|
| AC1 | `test_registry_exposes_web_search` — `web_search` in `names()` & `specs()`. |
| AC2 | `test_web_search_schema_has_query` — local-fallback spec schema requires `query:string`. |
| AC3 | `test_web_search_without_key_returns_error` — monkeypatch key blank; result starts with `error`, no raise. (keyless guard — always runs) |
| AC4 | `test_web_search_real_returns_sources` `@pytest.mark.tavily` — contains a URL. |
| AC5 | `test_web_search_respects_toggle` — `specs(["web_search"])` filters; disabled call refused. |
| AC6 | covered by `tsc` + the existing i18n key-parity Vitest (toolLabels en/pt stay in sync). |

## Order of work (red → green)

1. Add the `tavily` marker + skip logic to `conftest.py`.
2. Write `test_web_search.py` (AC1–AC5) → **red** (no `web_search` yet).
3. Add `tavily_api_key` to `config.py` + `.env.example`; add `tavily-python` to requirements.
4. Implement `_web_search` + `@mcp.tool()` in `server.py`; mirror in `client.py` → **green**.
5. Add `toolLabels.web_search` (en/pt) + stations tech listing.
6. Gates: `ruff check . && ruff format . && pytest -q` (backend), `npm run build && npm test` (frontend).
