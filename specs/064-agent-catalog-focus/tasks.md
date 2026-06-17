# Tasks: 064-agent-catalog-focus

TDD: each implement task is preceded by the failing test that drives it.

- [x] T1 (test, red) — `AgentCatalogSidebar.focus.test.tsx`: AC1–AC5 (focus on
      select/create/delete; re-bind only when unlocked).
- [x] T2 (test, red) — update `AgentCatalogSidebar.locked.test.tsx` to the new 045-AC10
      contract (locked rows focus, don't call `setSessionAgent`; +New/delete enabled).
- [x] T3 (impl) — add `frontend/src/lib/agentCatalog.ts` (`useAgentCatalog`): `agents`,
      `focusedId`, `refresh`, `setFocused`, `upsert`, `remove`.
- [x] T4 (impl) — rewire `useActiveAgent` (`lib/agentAccess.ts`) to resolve the edited
      agent from the shared store (focus-first) and `upsert` PATCH results.
- [x] T5 (test, red) — `agentAccess.test.tsx` AC6: focused agent is edited; PATCH hits its id.
- [x] T6 (impl) — rewire `AgentCatalogSidebar`: rows focus (not disabled); re-bind only
      when unlocked; create/delete operate on focus.
- [x] T7 (test, red) — `AgentAnatomyDialog.test.tsx` AC7: close clears `focusedId`.
- [x] T8 (impl) — clear `focusedId` on dialog close/unmount.
- [x] T9 (verify) — `npm test` green (523 passing), `tsc --noEmit` + `vite build` clean;
      no backend diff (`ruff`/`pytest` untouched). Status → done.
