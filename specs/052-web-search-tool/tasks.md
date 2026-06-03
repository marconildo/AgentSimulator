# Tasks: Web search tool (Tavily)

TDD checklist — each implement task is preceded by the failing test that drives it.
Status: done.

## Setup / red

- [x] T1 — Add a `tavily` marker to `conftest.py` and skip `@pytest.mark.tavily` tests when
      `TAVILY_API_KEY` is unset (mirror the `openai` gate). *(test infra)*
- [x] T2 — Write `backend/tests/test_web_search.py` with AC1, AC2, AC3, AC5 (and AC4 under
      `@pytest.mark.tavily`). Run → **red** (`web_search` does not exist yet).

## Green

- [x] T3 — `config.py`: add `tavily_api_key: str = ""` + `has_tavily_key`; document
      `TAVILY_API_KEY` in `.env.example`; add `tavily-python` to `requirements.txt`.
- [x] T4 — `server.py`: add `WEB_SEARCH_TOOL` / `WEB_SEARCH_DESCRIPTION`, `_web_search`,
      and the `@mcp.tool() web_search` registration (lazy `TavilyClient` import).
- [x] T5 — `client.py`: mirror `web_search` as a `RegisteredTool` in `_load_local()`.
- [x] T6 — Run `pytest -q` → AC1/AC2/AC3/AC5 **green**; AC4 skipped (no key locally).

## Frontend

- [x] T7 — `strings.ts`: add `web_search` to both `toolLabels` maps (en "Web search",
      pt "Busca na web").
- [x] T8 — `stations.ts`: append `web_search` to the MCP station's `tech` "tools" value.

## Verify (gates)

- [x] T9 — `ruff check . && ruff format .` clean (backend).
- [ ] T10 — `pytest -q` green (with `OPENAI_API_KEY`) — running.
- [x] T11 — `npm run build` (tsc + vite) and `npm test` (Vitest, 440) green (frontend).
- [x] T12 — Move spec status `planned → done`; update memory index.
