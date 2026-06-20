"""057-deepagents-runtime: the four DeepAgents pillars, hand-built and model-elected.

On the Intermediate rung the agent is offered the DeepAgents tools (``write_todos`` /
``write_file`` / ``read_file`` / ``edit_file`` / ``ls`` / ``task``) and *elects* to call
them inside its ReAct loop. The harness mandates planning, so a real task plans first
(``write_todos`` → ``agent.plan``). Most coverage is deterministic + keyless — the tool
handlers, the todo-status state, the filesystem, the state-block feedback loop, and the
advertised-tool gating. The sub-agent (``task``), the plan-first behavior, and the
Simple-rung guarantee are ``@pytest.mark.openai`` and assert structurally, per §9.
"""

import asyncio

import pytest

from app.agent import run_agent
from app.agent.deepagents import run_deepagents_tool
from app.agent.graph import _finalize_plan, _with_deepagents
from app.agent.tools import DEEPAGENTS_TOOLS, agent_tool_specs
from app.llm.provider import get_provider
from app.mcp.client import get_registry
from app.trace import TraceEmitter

_Q = "Why does chunk size matter in a RAG pipeline, and what is top-k?"


async def _collect(make_coro):
    emitter = TraceEmitter("test", _Q)

    async def drain():
        events = []
        while True:
            ev = await emitter.queue.get()
            if ev is None:
                break
            events.append(ev)
        return events

    drainer = asyncio.create_task(drain())
    result = await make_coro(emitter)
    await emitter.close()
    return result, await drainer


def _ends(events, stage):
    return [e for e in events if str(e.stage) == stage and e.phase == "end"]


async def _tool(name, args, *, state=None, vfs=None, plan=None, provider=None, registry=None):
    """Drive one DeepAgents tool handler and collect its trace events."""
    vfs = {} if vfs is None else vfs
    plan = [] if plan is None else plan

    async def call(em):
        return await run_deepagents_tool(
            name, args, state or {}, em, vfs, plan, provider=provider, registry=registry
        )

    return await _collect(call)


# --- Gating: who sees the DeepAgents tools (deterministic, keyless) -------------


def test_deepagents_gated_to_deepagents_runtime_and_composes_with_ragless():
    # 061-scenario-builder: gated purely by the `deepagents` runtime (was the
    # Intermediate rung). It now COMPOSES with RAGLESS — the two are independent
    # (the retrieval tool transparently uses PageIndex when ragless is on, while the
    # DeepAgents plan/file/delegate tools stay available).
    assert _with_deepagents({"runtime": "deepagents", "ragless": False}) is True
    assert _with_deepagents({"runtime": "deepagents", "ragless": True}) is True
    assert _with_deepagents({"runtime": "react", "ragless": False}) is False
    assert _with_deepagents({"runtime": "react", "ragless": True}) is False
    assert _with_deepagents({"runtime": "multiagent", "ragless": False}) is False


async def test_tools_advertised_on_intermediate_not_simple():
    registry = await get_registry()
    inter = {s.name for s in agent_tool_specs(registry, None, with_deepagents=True)}
    base = {s.name for s in agent_tool_specs(registry, None, with_deepagents=False)}
    for tool in DEEPAGENTS_TOOLS:
        assert tool in inter, f"{tool} should be advertised on the Intermediate rung"
        assert tool not in base, f"{tool} must not leak onto the base (Simple) tool list"
    # the canonical DeepAgents tool surface is present
    assert {"write_todos", "write_file", "read_file", "edit_file", "ls", "task"} <= inter


# --- Pillar 1: planning — write_todos manages a todo list with statuses ---------


async def test_write_todos_records_steps_with_default_status():
    plan: list[dict] = []
    _out, events = await _tool("write_todos", {"todos": ["Search KB", "Draft answer"]}, plan=plan)
    end = _ends(events, "agent.plan")[0]
    assert end.data["steps"] == ["Search KB", "Draft answer"]
    assert [t["content"] for t in plan] == ["Search KB", "Draft answer"]
    assert all(t["status"] == "pending" for t in plan)


async def test_write_todos_updates_statuses():
    plan: list[dict] = []
    await _tool(
        "write_todos",
        {
            "todos": [
                {"content": "Search KB", "status": "completed"},
                {"content": "Answer", "status": "in_progress"},
            ]
        },
        plan=plan,
    )
    assert plan[0] == {"content": "Search KB", "status": "completed"}
    assert plan[1] == {"content": "Answer", "status": "in_progress"}


# --- 067: the runtime closes out the plan when the answer is produced -----------


async def test_finalize_plan_completes_remaining_todos_on_finish():
    # The model left the synthesis todo in_progress and answered directly; on finish the
    # runtime reconciles the plan to all-completed and emits a closing agent.plan.
    state = {
        "plan": [
            {"content": "Search KB", "status": "completed"},
            {"content": "Synthesize the answer", "status": "in_progress"},
        ]
    }
    updates, events = await _collect(lambda em: _finalize_plan(state, em))
    ends = _ends(events, "agent.plan")
    assert ends, "finalizing should emit a closing agent.plan"
    assert ends[0].data["finalized"] is True
    assert [t["status"] for t in ends[0].data["todos"]] == ["completed", "completed"]
    assert all(t["status"] == "completed" for t in updates["plan"])
    # content is preserved, order kept.
    assert [t["content"] for t in updates["plan"]] == ["Search KB", "Synthesize the answer"]


async def test_finalize_plan_is_noop_when_already_complete_or_no_plan():
    # already fully completed → nothing to reconcile, no extra event, no state churn.
    done = {"plan": [{"content": "x", "status": "completed"}]}
    upd, events = await _collect(lambda em: _finalize_plan(done, em))
    assert upd == {}
    assert not _ends(events, "agent.plan")
    # Simple/ReAct runtime has no plan at all → no-op.
    upd2, events2 = await _collect(lambda em: _finalize_plan({}, em))
    assert upd2 == {}
    assert not _ends(events2, "agent.plan")


# --- Pillar 2: the virtual file system — write / read / edit / ls ---------------


async def test_virtual_fs_write_then_read_roundtrip():
    vfs: dict[str, str] = {}
    await _tool(
        "write_file", {"path": "research.md", "content": "chunk size trades recall"}, vfs=vfs
    )
    out, events = await _tool("read_file", {"path": "research.md"}, vfs=vfs)
    assert out == "chunk size trades recall"
    assert _ends(events, "agent.fs.read")[0].data["found"] is True
    assert vfs["research.md"] == "chunk size trades recall"


async def test_edit_file_replaces_in_place():
    vfs = {"notes.md": "the sky is red"}
    out, events = await _tool(
        "edit_file", {"path": "notes.md", "old_string": "red", "new_string": "blue"}, vfs=vfs
    )
    assert "Wrote" in out
    assert vfs["notes.md"] == "the sky is blue"
    assert _ends(events, "agent.fs.write")[0].data["content"] == "the sky is blue"


async def test_edit_missing_file_is_an_error():
    vfs: dict[str, str] = {}
    out, _events = await _tool("edit_file", {"path": "nope.md", "new_string": "x"}, vfs=vfs)
    assert out.startswith("error:")


async def test_ls_lists_scratchpad_files():
    out, events = await _tool("ls", {}, vfs={"plan.md": "x", "research.md": "y"})
    assert "plan.md" in out and "research.md" in out
    assert _ends(events, "agent.fs.read")


async def test_read_missing_file_returns_error_not_found():
    out, events = await _tool("read_file", {"path": "nope.md"}, vfs={})
    assert out.startswith("error:")
    assert _ends(events, "agent.fs.read")[0].data["found"] is False


# --- Pillar 3: real sub-agents — task spawns a bounded sub-agent (needs a key) --


@pytest.mark.openai
async def test_task_spawns_researcher_subagent_and_returns_result():
    provider = get_provider()
    registry = await get_registry()
    state = {
        "message": _Q,
        "top_k": 3,
        "session_id": None,
        "rerank": False,
        "rerank_threshold": 0.0,
    }
    result, events = await _tool(
        "task", {"description": _Q}, state=state, provider=provider, registry=registry
    )
    delegate = _ends(events, "agent.delegate")
    assert delegate, "task should emit an agent.delegate END"
    data = delegate[0].data
    assert data["subagent"] == "researcher"
    assert data["result"].strip(), "the sub-agent returns a non-empty result"
    # Context quarantine: only the sub-agent's result returns to the lead agent (the tool
    # observation), not its intermediate messages.
    assert result.strip() == data["result"].strip()
    # It ran a real bounded loop — the tool-trail is recorded (possibly empty if the model
    # answered directly; we don't force a tool call, which is model-dependent, per §9).
    assert isinstance(data["steps"], list)
    assert isinstance(data["rounds"], int)


# --- AC6: model-driven — a greeting elects nothing; Simple never offers them ----


async def _full_run(message, runtime):
    emitter = TraceEmitter("test", message)

    async def drain():
        events = []
        while True:
            ev = await emitter.queue.get()
            if ev is None:
                break
            events.append(ev)
        return events

    drainer = asyncio.create_task(drain())
    answer = await run_agent(message, 3, emitter, runtime=runtime)
    await emitter.close()
    return answer, await drainer


_DEEP_STAGES = ["agent.plan", "agent.fs.write", "agent.fs.read", "agent.delegate"]


@pytest.mark.openai
async def test_real_task_on_deepagents_runtime_plans_first():
    # The DeepAgent harness mandates planning: a real task under the `deepagents` runtime
    # must elect write_todos (→ agent.plan) before answering. This is the behavioral
    # guarantee that makes it a DeepAgent and not a plain ReAct loop with unused tools.
    _answer, events = await _full_run(
        "Research how RAG retrieval works and how chunk size and top-k affect it, then "
        "give me a structured summary.",
        "deepagents",
    )
    assert _ends(events, "agent.plan"), "a real task should elect write_todos (agent.plan)"


@pytest.mark.openai
async def test_react_runtime_never_emits_deepagents_stages():
    answer, events = await _full_run(_Q, "react")
    stages = {str(e.stage) for e in events}
    for forbidden in _DEEP_STAGES:
        assert forbidden not in stages, f"the ReAct runtime must not emit {forbidden}"
    assert answer.strip()


# --- The TodoListMiddleware-style feedback loop (keyless) -----------------------


def test_deepagents_state_block_reflects_todos_and_files():
    from app.agent.prompts import deepagents_state_block

    block = deepagents_state_block(
        [
            {"content": "Search KB", "status": "completed"},
            {"content": "Answer", "status": "in_progress"},
        ],
        {"research.md": "findings"},
    )
    assert "[completed] Search KB" in block
    assert "[in_progress] Answer" in block
    assert "research.md" in block
    # Empty state renders nothing (the first round just reads the mandate).
    assert deepagents_state_block([], {}) == ""


# --- Final-answer prompt: the plan must not leak into the user's answer ----------
# Regression: a weaker model echoed the DeepAgents scaffolding ("Plan:", "PLAN
# FIRST", "Work the plan", the todo list) into the final answer because the loop
# mandate + the live todo block were still in the system prompt at answer time.
# The final-answer prompt must drop the planning mandate AND the re-injected state.


def _deepagents_state(**over):
    state = {
        "runtime": "deepagents",
        "plan": [{"content": "Calculate 12 * (3 + 1)", "status": "completed"}],
        "vfs": {"scratch.md": "notes"},
        "skills_catalog": [],
    }
    state.update(over)
    return state


def test_deepagents_block_final_variant_swaps_mandate_for_synthesis():
    from app.agent.prompts import deepagents_block

    loop = deepagents_block("deepagents")
    final = deepagents_block("deepagents", final=True)
    # The loop block carries the planning mandate; the final block must not.
    assert "Always start with" in loop
    assert "Always start with" not in final
    # The `write_todos` tool call is mandated in the loop, never in the final block.
    assert "write_todos" in loop
    assert "write_todos" not in final
    # The final block tells the model to reply with only the answer.
    assert "only the answer" in final.lower()
    # Off the DeepAgents runtime both variants stay empty (ReAct byte-for-byte).
    assert deepagents_block("react") == ""
    assert deepagents_block("react", final=True) == ""


def test_final_answer_system_drops_planning_scaffolding():
    from app.agent.graph import _effective_system

    state = _deepagents_state()
    final = _effective_system(state, final=True)
    # The planning mandate ("Always start with `write_todos`") must be gone.
    assert "Always start with" not in final
    # The live todo block (re-injected during the loop) must be gone at answer time.
    assert "Calculate 12 * (3 + 1)" not in final
    assert "DeepAgent working state" not in final
    # And it instructs an answer-only synthesis instead.
    assert "only the answer" in final.lower()


def test_loop_system_still_carries_the_planning_mandate():
    from app.agent.graph import _effective_system

    state = _deepagents_state()
    loop = _effective_system(state)  # final defaults to False
    assert "PLAN FIRST" in loop
    # And it still re-injects the live plan so the agent maintains it.
    assert "Calculate 12 * (3 + 1)" in loop


def test_react_runtime_final_equals_loop_byte_for_byte():
    from app.agent.graph import _effective_system

    state = _deepagents_state(runtime="react", plan=[], vfs={})
    # On the ReAct runtime the `final` flag is inert — Simple stays byte-for-byte.
    assert _effective_system(state, final=True) == _effective_system(state)
