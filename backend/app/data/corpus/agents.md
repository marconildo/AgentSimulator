# AI Agents and the ReAct Loop

An AI agent is a language model wrapped in a control loop that lets it take
actions, observe the results, and decide what to do next. Rather than producing
a single answer in one shot, an agent can call tools, read their output, and
iterate until it has enough information to respond.

The most common pattern is **ReAct** (Reason + Act). On each turn the model
either emits a tool call (an action) or a final answer. When it emits a tool
call, the orchestrator runs the tool and feeds the result back into the
conversation, then asks the model again. The loop continues until the model
decides to answer or a step limit is reached. The step limit is important: it
prevents runaway loops and bounds cost and latency.

Frameworks like LangGraph model this loop as a graph of nodes. A typical graph
has a node that calls the model, a conditional edge that checks whether the
model requested a tool, a tool-execution node, and an edge that loops back to
the model node. Modeling the agent as an explicit state machine makes it easy to
add memory, branching, retries, and human-in-the-loop checkpoints.

Good agent design is mostly about constraints: a clear system prompt, a small
set of well-described tools, and sensible limits. Too many tools confuse the
model; vague tool descriptions lead to wrong calls. The art is giving the model
just enough freedom to be useful without letting it wander.
