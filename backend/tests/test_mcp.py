"""The MCP tool registry exposes the demo tools and executes them."""

from app.mcp.client import get_registry, jsonrpc_frames
from app.mcp.server import _kb_lookup, found_for


async def test_registry_exposes_demo_tools():
    registry = await get_registry()
    names = set(registry.names())
    assert {"calculator", "current_time", "kb_lookup"} <= names
    assert registry.transport in {"mcp-stdio", "local-fallback"}


async def test_calculator_tool_executes():
    registry = await get_registry()
    result = await registry.call("calculator", {"expression": "6 * 7"})
    assert result.strip() == "42"


async def test_unknown_tool_is_handled():
    registry = await get_registry()
    result = await registry.call("does_not_exist", {})
    assert "error" in result.lower()


# --- Tool toggles (006-interactive-experiments) -----------------------------


async def test_specs_unfiltered_returns_all_tools():
    registry = await get_registry()
    names = {s.name for s in registry.specs()}
    assert {"calculator", "current_time", "kb_lookup"} <= names
    # None means "no override" — same as unfiltered.
    assert {s.name for s in registry.specs(None)} == names


async def test_specs_filtered_to_enabled_tools():
    registry = await get_registry()
    specs = registry.specs(["calculator"])
    assert [s.name for s in specs] == ["calculator"]


async def test_specs_empty_list_disables_all_tools():
    registry = await get_registry()
    assert registry.specs([]) == []


async def test_call_refuses_a_disabled_tool():
    # Defense in depth: even if a disabled tool were somehow requested, the
    # registry refuses it (the agent only ever sees the filtered specs).
    registry = await get_registry()
    result = await registry.call("calculator", {"expression": "2 + 2"}, enabled=["current_time"])
    assert "error" in result.lower()
    # Still callable when enabled (or with no filter).
    assert (
        await registry.call("calculator", {"expression": "2 + 2"}, enabled=["calculator"])
    ).strip() == "4"


# --- JSON-RPC frames (007-numeric-transparency) -----------------------------


def test_jsonrpc_frames_are_well_formed():
    # AC1 — canonical JSON-RPC 2.0 request/response built from a real exchange.
    frames = jsonrpc_frames(
        "tools/call",
        {"name": "calculator", "arguments": {"expression": "2 + 2"}},
        {"content": [{"type": "text", "text": "4"}]},
        reconstructed=False,
    )
    req, resp = frames["request"], frames["response"]
    assert req["jsonrpc"] == "2.0" and resp["jsonrpc"] == "2.0"
    assert req["method"] == "tools/call"
    assert req["params"]["name"] == "calculator"
    assert "result" in resp
    assert req["id"] == resp["id"]  # request/response correlate
    assert frames["reconstructed"] is False


def test_jsonrpc_frames_flag_reconstructed_for_local_fallback():
    # AC1 (Q1) — the local in-process path tags frames `reconstructed: true`, so
    # the UI never lets the fallback masquerade as real wire traffic.
    frames = jsonrpc_frames("tools/list", {}, {"tools": []}, reconstructed=True)
    assert frames["reconstructed"] is True
    assert frames["request"]["method"] == "tools/list"


async def test_discover_event_carries_jsonrpc_local_fallback():
    # AC1 — the mcp.discover event carries reconstructed `tools/list` frames on the
    # local-fallback transport (deterministic; route_node never touches the LLM).
    from app.agent.graph import route_node
    from app.mcp.client import _load_local
    from app.trace import TraceEmitter

    emitter = TraceEmitter("t", "q")
    registry = _load_local()
    config = {"configurable": {"emitter": emitter, "provider": None, "registry": registry}}
    state = {"message": "q", "history": [], "enabled_tools": None}

    await route_node(state, config)  # type: ignore[arg-type]

    discover = next(e for e in emitter.events if e.stage == "mcp.discover" and e.phase == "end")
    jr = discover.data["jsonrpc"]
    assert jr["request"]["method"] == "tools/list"
    assert "tools" in jr["response"]["result"]
    assert jr["reconstructed"] is True


async def test_call_event_carries_jsonrpc_local_fallback():
    # AC1/AC2 — the mcp.call event carries non-empty `tools/call` request AND
    # response frames on the local-fallback transport (calculator is deterministic).
    from langchain_core.messages import AIMessage

    from app.agent.graph import tools_node
    from app.mcp.client import _load_local
    from app.trace import TraceEmitter

    emitter = TraceEmitter("t", "q")
    registry = _load_local()
    config = {"configurable": {"emitter": emitter, "provider": None, "registry": registry}}
    # 026-agent-tool-autonomy: tools_node executes the tool_calls on the trailing
    # AIMessage of the canonical thread, returning each result as a ToolMessage.
    state = {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "1",
                        "name": "calculator",
                        "args": {"expression": "2 + 2"},
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
    jr = call.data["jsonrpc"]
    assert jr["request"]["method"] == "tools/call"
    assert jr["request"]["params"]["name"] == "calculator"
    assert jr["response"]["result"]  # non-empty response frame
    assert jr["reconstructed"] is True


# --- Abstain / structured `found` signal (021-abstain-badge) -----------------


def test_found_for_kb_lookup_miss_and_hit():
    # AC1 (backend) — the not-found signal, computed structurally from the tool's
    # own clean result (single source of truth in server.py).
    assert found_for("kb_lookup", _kb_lookup("rag")) is True
    assert found_for("kb_lookup", _kb_lookup("a topic that does not exist")) is False


def test_found_for_other_tools_default_true():
    # calculator / current_time always produce a substantive result.
    assert found_for("calculator", "42") is True
    assert found_for("current_time", "2026-05-27 10:00:00 UTC") is True


def test_found_for_empty_result_is_false():
    # Any tool returning empty/whitespace is "nothing found" (scope = any tool).
    assert found_for("calculator", "") is False
    assert found_for("kb_lookup", "   ") is False


async def test_kb_lookup_found_parity_across_transports():
    # AC1b — a kb_lookup miss is found:false and a hit found:true on BOTH the
    # local fallback AND the mcp-stdio path. Both transports return the same clean
    # text, so the structured signal is identical (no transport-specific drift).
    from app.mcp.client import _load_local, _load_via_mcp

    local = _load_local()
    assert found_for("kb_lookup", await local.call("kb_lookup", {"topic": "zzz"})) is False
    assert found_for("kb_lookup", await local.call("kb_lookup", {"topic": "rag"})) is True

    try:
        stdio = await _load_via_mcp()
    except Exception:  # noqa: BLE001 - the stdio transport may be unavailable here
        stdio = None
    if stdio is not None:
        assert stdio.transport == "mcp-stdio"
        assert found_for("kb_lookup", await stdio.call("kb_lookup", {"topic": "zzz"})) is False
        assert found_for("kb_lookup", await stdio.call("kb_lookup", {"topic": "rag"})) is True


async def test_mcp_call_event_records_found():
    # AC1b — the mcp.call END `data` carries `found` (kb_lookup is deterministic,
    # so this needs no model). A miss records found:false; a hit found:true.
    from langchain_core.messages import AIMessage

    from app.agent.graph import tools_node
    from app.mcp.client import _load_local
    from app.trace import TraceEmitter

    async def call_topic(topic: str) -> dict:
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
                            "name": "kb_lookup",
                            "args": {"topic": topic},
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
        return next(e.data for e in emitter.events if e.stage == "mcp.call" and e.phase == "end")

    assert (await call_topic("a topic that does not exist"))["found"] is False
    assert (await call_topic("rag"))["found"] is True
