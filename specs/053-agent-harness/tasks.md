# Tasks: Agent Harness framing + Learn topic

> TDD checklist, ordered red → green → refactor. Frontend-only. Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC2)**: failing test asserting `glossary["Agent Harness"]`
      exists and is non-empty in **both** the `en` and `pt` glossary maps.
- [x] **T2 — implement**: add the `"Agent Harness"` glossary entry (en + pt) in
      `strings.ts`. Make T1 green.
- [x] **T3 — test first (AC1)**: failing test asserting `agentDetail.harness`
      resolves non-empty for en & pt and includes the literal "Agent Harness".
- [x] **T4 — implement**: add `agentDetail.harness` to the interface + en + pt
      blocks; render the harness framing line/badge in `AgentDetail.tsx`, tagged
      with the glossary term. Make T3 green.
- [x] **T5 — test first (AC3)**: failing test asserting `allTopicsFor("en")` and
      `allTopicsFor("pt")` contain id `agent-harness` with non-empty
      what/why/how/options and ≥1 `links` entry.
- [x] **T6 — implement**: add the `agent-harness` `TopicSrc` to the `genai` section
      of `content.ts` (full study structure, bilingual, ≥1 link). Make T5 green.
- [x] **T7 — guard (AC4)**: assert `tierByIdFor(lang).agent` title/alias unchanged
      (en "Agent Tier"/"Compute (private)", pt "Camada do Agente"/"Compute
      (privado)"). Should pass without code change — proves no tier rename.
- [x] **T8 — guard (AC5)**: confirm `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity tests
      stay green and `git diff --stat backend/` is empty.
- [x] **T9 — refactor**: tidy wording, ensure tooltip renders, keep all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC5).
- [x] `npm run build` passes (`tsc --noEmit` + build).
- [x] `npm test` (Vitest) green.
- [x] No protocol drift: no new `Stage`/`Phase`/`TraceEvent`; `backend/` diff empty.
- [x] Every new user-facing string exists in en **and** pt (glossary, agentDetail,
      Learn topic).
- [x] Deployment tier label unchanged ("Agent Tier" / "Camada do Agente").
- [x] `spec.md` status updated to `done`.
