"""Skills — a global, agent-loadable skill catalog (027-skills).

A skill is `{name, description, body}`: the agent advertises name+description in
its system prompt and loads the body on demand via the `load_skill` MCP tool. The
relational/CRUD/seed/clear and tool/prompt assertions are keyless; the end-to-end
"agent chooses to load a skill" check is `@pytest.mark.openai` and asserts
structurally to tolerate model variability.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.db.seed import SEED_SKILLS, seed_skills
from app.db.store import ConversationStore, DuplicateSkillName, get_store
from app.main import app
from app.mcp.client import _load_local

# --- AC1: catalog CRUD persists (keyless) -----------------------------------


async def test_skill_crud_round_trip(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    assert await store.list_skills() == []

    created = await store.create_skill("greeter", "Greets the user.", "Always say hi first.")
    assert created["id"]
    assert created["created_at"] == created["updated_at"]

    listed = await store.list_skills()
    assert [s["name"] for s in listed] == ["greeter"]
    assert listed[0]["description"] == "Greets the user."
    assert listed[0]["body"] == "Always say hi first."

    fetched = await store.get_skill(created["id"])
    assert fetched and fetched["name"] == "greeter"
    by_name = await store.get_skill_by_name("greeter")
    assert by_name and by_name["id"] == created["id"]

    updated = await store.update_skill(created["id"], "greeter", "Greets warmly.", "Say hello!")
    assert (
        updated and updated["description"] == "Greets warmly." and updated["body"] == "Say hello!"
    )
    assert updated["updated_at"] >= created["updated_at"]

    deleted = await store.delete_skill(created["id"])
    assert deleted["deleted"] is True
    assert await store.list_skills() == []
    assert await store.get_skill(created["id"]) is None


async def test_skill_name_is_unique(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    await store.create_skill("dup", "first", "body a")
    with pytest.raises(DuplicateSkillName):
        await store.create_skill("dup", "second", "body b")
    # Renaming one skill onto another's name is rejected too.
    other = await store.create_skill("other", "x", "y")
    with pytest.raises(DuplicateSkillName):
        await store.update_skill(other["id"], "dup", "x", "y")


async def test_update_missing_skill_returns_none(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    assert await store.update_skill("nope", "n", "d", "b") is None


# --- AC8: example skills seeded idempotently (keyless) ----------------------


async def test_seed_populates_empty_catalog_and_is_idempotent(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")

    added = await seed_skills(store)
    assert added == len(SEED_SKILLS) >= 1
    skills = await store.list_skills()
    assert len(skills) == len(SEED_SKILLS)
    for s in skills:
        assert s["name"].strip() and s["description"].strip() and s["body"].strip()

    # A second seed over a populated catalog adds nothing (no duplicates).
    assert await seed_skills(store) == 0
    assert len(await store.list_skills()) == len(SEED_SKILLS)


# --- AC6 (persistence side): applied skills round-trip on a message ----------


async def test_message_skills_round_trip(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]

    await store.write_message(sid, "m1", "q", "a", skills=["resumo-em-bullets"])
    msgs = await store.list_messages(sid)
    assert msgs[0]["skills"] == ["resumo-em-bullets"]

    # A message stored without applied skills defaults to an empty list.
    await store.write_message(sid, "m2", "q2", "a2")
    assert (await store.list_messages(sid))[-1]["skills"] == []


# --- AC7 (store side): clear wipes the catalog ------------------------------


async def test_clear_all_reports_and_wipes_skills(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    await store.create_skill("a", "d", "b")
    await store.create_skill("c", "d", "b")

    result = await store.clear_all()
    # 043-persisted-agent: clear now wipes agents too (and re-seeds the default).
    # 048-persist-traces: + trace_events_deleted (0 here — this test never emits).
    assert result == {
        "sessions_deleted": 0,
        "messages_deleted": 0,
        "documents_deleted": 0,
        "skills_deleted": 2,
        "agents_deleted": 1,
        "trace_events_deleted": 0,
    }
    assert await store.list_skills() == []
    # Idempotent: a second clear reports zero skills removed.
    assert (await store.clear_all())["skills_deleted"] == 0


# --- AC3: load_skill is an advertised tool ----------------------------------


async def test_load_skill_is_advertised_and_gated_by_enabled_tools():
    from app.agent.tools import agent_tool_specs

    registry = _load_local()
    names = {s.name for s in agent_tool_specs(registry, None)}
    assert "load_skill" in names
    spec = next(s for s in agent_tool_specs(registry, None) if s.name == "load_skill")
    assert spec.description.strip()
    # 006 gate: an empty enabled list advertises nothing, including load_skill.
    assert agent_tool_specs(registry, []) == []
    # A list that omits load_skill drops it.
    assert "load_skill" not in {s.name for s in agent_tool_specs(registry, ["calculator"])}


# --- AC4: load_skill returns the body via the registry ----------------------


async def _seed_one(name: str, body: str) -> str:
    """Create a skill in the shared (conftest) store; return its id for cleanup."""
    store = get_store()
    existing = await store.get_skill_by_name(name)
    if existing:
        await store.delete_skill(existing["id"])
    return (await store.create_skill(name, "a test skill", body))["id"]


async def test_load_skill_returns_body_and_handles_unknown():
    skill_id = await _seed_one("unit-skill-abc", "FOLLOW THESE INSTRUCTIONS.")
    try:
        registry = _load_local()
        assert await registry.call("load_skill", {"name": "unit-skill-abc"}) == (
            "FOLLOW THESE INSTRUCTIONS."
        )
        unknown = await registry.call("load_skill", {"name": "does-not-exist-zzz"})
        assert unknown.startswith("error:")
    finally:
        await get_store().delete_skill(skill_id)


async def test_load_skill_rides_mcp_call_with_body_result():
    # AC4/AC9 — a load_skill call animates the MCP station (mcp.call) and records
    # {tool, args, result} just like any tool (no new Stage). Deterministic, keyless.
    from langchain_core.messages import AIMessage

    from app.agent.graph import tools_node
    from app.trace import TraceEmitter

    skill_id = await _seed_one("unit-skill-def", "BODY-DEF-123")
    try:
        emitter = TraceEmitter("t", "q")
        registry = _load_local()
        config = {"configurable": {"emitter": emitter, "provider": None, "registry": registry}}
        state = {
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "id": "1",
                            "name": "load_skill",
                            "args": {"name": "unit-skill-def"},
                            "type": "tool_call",
                        }
                    ],
                )
            ],
            "used_tools": [],
            "context": "",
            "chunks": [],
            "top_k": 3,
            "session_id": None,
            "message": "q",
            "enabled_tools": None,
            "simulate_failure": "none",
        }
        await tools_node(state, config)  # type: ignore[arg-type]
        call = next(e for e in emitter.events if e.stage == "mcp.call" and e.phase == "end")
        assert call.data["tool"] == "load_skill"
        assert call.data["args"] == {"name": "unit-skill-def"}
        assert call.data["result"] == "BODY-DEF-123"
    finally:
        await get_store().delete_skill(skill_id)


# --- AC2 / AC3: catalog advertised in the prompt (name + description only) ----

_CATALOG = [
    {"name": "resumo-em-bullets", "description": "Use para resumir em tópicos."},
    {"name": "glossario-ao-final", "description": "Acrescenta um glossário ao final."},
]


def test_skills_block_lists_name_and_description_not_body():
    from app.agent.prompts import compose_system, skills_block

    block = skills_block(_CATALOG)
    assert "resumo-em-bullets" in block and "Use para resumir em tópicos." in block
    assert "glossario-ao-final" in block
    assert "load_skill" in block  # tells the model how to load one
    assert skills_block([]) == ""  # empty catalog ⇒ no block

    # 042-agent-anatomy: compose_system is now three layers (guardrails + role
    # + skills). Only the catalog-appending behavior is asserted here; the layer
    # semantics live in test_agent_prompt_layers.py.
    composed = compose_system("GUARDS", "BASE PROMPT", _CATALOG)
    assert composed.startswith("GUARDS\n\nBASE PROMPT")
    assert "resumo-em-bullets" in composed


def _state(system_prompt=None, enabled_tools=None, catalog=None):
    return {
        "system_prompt": system_prompt,
        "enabled_tools": enabled_tools,
        "skills_catalog": catalog if catalog is not None else _CATALOG,
    }


def test_effective_system_appends_catalog_only_when_skills_advertised():
    # 042-agent-anatomy: the assembled system message is now
    # guardrails + role + (optional) skills; the role layer is the one that
    # carries the agent's identity text the prior ``SYSTEM_PROMPT`` shipped.
    from app.agent.graph import _effective_system
    from app.agent.prompts import AGENT_PROMPT, GUARDRAILS_PROMPT

    no_skills = f"{GUARDRAILS_PROMPT}\n\n{AGENT_PROMPT}"

    # Default run (no enabled override) ⇒ the catalog block is appended.
    with_block = _effective_system(_state())  # type: ignore[arg-type]
    assert "resumo-em-bullets" in with_block
    assert AGENT_PROMPT in with_block and GUARDRAILS_PROMPT in with_block

    # load_skill explicitly enabled ⇒ still appended.
    assert "resumo-em-bullets" in _effective_system(_state(enabled_tools=["load_skill"]))  # type: ignore[arg-type]

    # All tools disabled ⇒ nothing can be loaded ⇒ block omitted (AC3).
    assert _effective_system(_state(enabled_tools=[])) == no_skills  # type: ignore[arg-type]
    # A tool list without load_skill ⇒ omitted too.
    assert _effective_system(_state(enabled_tools=["calculator"])) == no_skills  # type: ignore[arg-type]
    # Empty catalog ⇒ omitted (backward compatible, AC11).
    assert _effective_system(_state(catalog=[])) == no_skills  # type: ignore[arg-type]

    # A system_prompt override still gets the catalog appended; it now replaces
    # only the guardrails layer (the role layer keeps its default).
    over = _effective_system(_state(system_prompt="ONLY THIS"))  # type: ignore[arg-type]
    assert over.startswith("ONLY THIS") and "resumo-em-bullets" in over


# --- AC6 (backend): applied-skill extraction from the trace ------------------


def _mcp_call(tool, args, result):
    from app.schemas import TraceEvent

    return TraceEvent(
        trace_id="t",
        seq=1,
        stage="mcp.call",
        phase="end",
        data={"tool": tool, "args": args, "result": result},
    )


def test_applied_skills_extracts_distinct_successful_loads():
    from types import SimpleNamespace

    from app.main import _applied_skills

    events = [
        _mcp_call("load_skill", {"name": "resumo-em-bullets"}, "BODY A"),
        _mcp_call("calculator", {"expression": "2+2"}, "4"),  # not a skill
        _mcp_call("load_skill", {"name": "resumo-em-bullets"}, "BODY A"),  # duplicate
        _mcp_call("load_skill", {"name": "missing"}, "error: skill 'missing' not found"),  # failed
        _mcp_call("load_skill", {"name": "glossario-ao-final"}, "BODY B"),
    ]
    applied = _applied_skills(SimpleNamespace(events=events))
    assert applied == ["resumo-em-bullets", "glossario-ao-final"]
    assert _applied_skills(SimpleNamespace(events=[])) == []


# --- AC1 (endpoint): the skills REST surface ---------------------------------


def test_skills_rest_crud():
    with TestClient(app) as client:
        name = "rest-test-skill-abc"
        # Remove any leftover from a prior run so the create succeeds.
        for s in client.get("/api/skills").json():
            if s["name"] == name:
                client.delete(f"/api/skills/{s['id']}")

        created = client.post("/api/skills", json={"name": name, "description": "d", "body": "b"})
        assert created.status_code == 200
        sid = created.json()["id"]
        assert name in {s["name"] for s in client.get("/api/skills").json()}

        # A duplicate name is rejected (409).
        dup = client.post("/api/skills", json={"name": name, "description": "x", "body": "y"})
        assert dup.status_code == 409

        # Update replaces the fields.
        upd = client.put(
            f"/api/skills/{sid}", json={"name": name, "description": "d2", "body": "b2"}
        )
        assert upd.status_code == 200 and upd.json()["description"] == "d2"
        # Updating a missing skill is a 404.
        missing = client.put(
            "/api/skills/nope", json={"name": "z", "description": "d", "body": "b"}
        )
        assert missing.status_code == 404

        # Delete removes it from the catalog.
        assert client.delete(f"/api/skills/{sid}").json()["deleted"] is True
        assert name not in {s["name"] for s in client.get("/api/skills").json()}


def test_create_skill_rejects_blank_fields():
    with TestClient(app) as client:
        resp = client.post("/api/skills", json={"name": "", "description": "d", "body": "b"})
        assert resp.status_code == 422  # pydantic min_length


# --- AC5 (e2e, [openai]): the agent chooses to load a relevant skill ----------


async def _run_with_catalog(message: str, catalog: list[dict], enabled_tools=None):
    from app.agent import run_agent
    from app.trace import TraceEmitter

    emitter = TraceEmitter("test", message)

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    answer = await run_agent(
        message, 3, emitter, skills_catalog=catalog, enabled_tools=enabled_tools
    )
    await emitter.close()
    return answer, await drainer


@pytest.mark.openai
async def test_agent_loads_a_relevant_skill():
    # A skill whose body the model cannot guess ("formato especial") strongly
    # induces a load_skill call. Structural assertions only (a load happened, the
    # answer is non-empty) to tolerate model variability.
    store = get_store()
    name = "formato-especial-xyz"
    description = "Use SEMPRE que o usuário pedir a resposta no 'formato especial'."
    existing = await store.get_skill_by_name(name)
    if existing:
        await store.delete_skill(existing["id"])
    sid = (
        await store.create_skill(name, description, "Comece a resposta com 'FORMATO-ESPECIAL:'.")
    )["id"]
    try:
        answer, events = await _run_with_catalog(
            "Responda no formato especial: o que é um agente de IA?",
            [{"name": name, "description": description}],
        )
        load_calls = [
            e
            for e in events
            if e.stage == "mcp.call" and e.phase == "end" and e.data.get("tool") == "load_skill"
        ]
        assert load_calls, "the agent did not load the relevant skill"
        assert any(c.data.get("args", {}).get("name") == name for c in load_calls)
        assert answer.strip()

        from types import SimpleNamespace

        from app.main import _applied_skills

        assert name in _applied_skills(SimpleNamespace(events=events))
    finally:
        await store.delete_skill(sid)
