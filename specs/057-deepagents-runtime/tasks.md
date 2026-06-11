# Tasks: DeepAgents runtime (planner + sub-agents + virtual file system)

> Ordered TDD checklist. Each implement task is preceded by the failing test that drives
> it (red → green → refactor). Status: spec `done`.
>
> **Amendment 2026-06-11 (post-review).** T1–T11 below shipped the **forced-preamble** v1.
> After live review (a greeting triggered RAG; "not a DeepAgents structure") it was
> **reworked to tool-driven** — see the amendments in `spec.md` / `plan.md`. Net: the
> `deepagents_node` was deleted; the five capabilities became **native tools the model
> elects** (`write_todos` / `write_file` / `read_file` / `ls` / `delegate_research`) in
> `agent/tools.py` (gated `with_deepagents`) + handlers in `agent/deepagents.py` +
> `DEEPAGENTS_PROMPT` on the role layer; `test_deepagents.py` rewritten (keyless handler +
> gating tests + `@openai` greeting/Simple negatives). All four stages, the protocol mirror,
> the drill-in panels (T5/T9) and i18n (T10) are unchanged. Side fix: reranker threshold
> default 0.0 → 0.05 (`test_config_default_rerank_threshold_is_0_05`).

## Tasks

- [x] **T1 — test first (AC6)**: `backend/tests/test_deepagents.py::test_simple_emits_no_deepagents_stages`
      — a `scenario=simple` run emits none of `agent.plan|agent.fs.*|agent.delegate`.
- [x] **T2 — protocol**: add the 4 `Stage`s in `schemas.py`; mirror in `events.ts`; add
      them to the `agent` station `stages` in `stations.ts` and to `STAGE_TO_PHASE`
      (`reason`). Add `plan`/`vfs` to `AgentState`; init in `run_agent_state`.
- [x] **T3 — implement**: `backend/app/agent/deepagents.py` (planner, virtual FS
      read/write, researcher sub-agent, `run_deepagents`); `deepagents_node` in `graph.py`
      gated on intermediate; wire `route → deepagents → think`. Makes T1 green.
- [x] **T4 — test first (AC1)**: planner fires on intermediate — `agent.plan` END with
      ≥1 step.
- [x] **T5 — test first (AC2)**: an `agent.fs.read` END returns the content of an earlier
      `agent.fs.write` END (same path).
- [x] **T6 — test first (AC3)**: an `agent.delegate` END fires with a non-empty digest and
      the scratchpad message is folded into the final thread.
- [x] **T7 — green**: implement until T4–T6 pass (real OpenAI, structural asserts).
- [x] **T8 — test first (AC5)**: `frontend/src/lib/deepagents.test.ts` — `derivePlan` /
      `deriveVfs` project a synthetic event log into steps + files.
- [x] **T9 — implement (AC5)**: `lib/deepagents.ts` + Plan & Virtual-FS panels in
      `AgentDetail.tsx`; FlowCanvas readout line. Makes T8 green.
- [x] **T10 — i18n (AC7)**: add all new `agentDetail.*` / readout strings in en + pt;
      drop the "Planned — not yet implemented" flag on the `DeepAgents` glossary entry.
- [x] **T11 — refactor**: clean up, keep all tests green.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`)
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` green
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), every Stage mapped to a
      station (§6) and a phase (§1)
- [ ] All new user-facing text exists in en **and** pt (§4)
- [ ] `spec.md` status updated to `done`; `docs/roadmap.md` DeepAgents item flipped to ✅
