# Model Context Protocol (MCP)

The Model Context Protocol is an open standard that lets AI applications connect
to tools and data sources in a uniform way. Before MCP, every integration was
bespoke: each app wired up each API by hand. MCP defines a common protocol so a
single client can talk to many interchangeable servers.

An **MCP server** exposes capabilities — most importantly *tools* (functions the
model can call), but also *resources* (readable data) and *prompts* (reusable
templates). An **MCP client**, embedded in the AI application, connects to one
or more servers, discovers what they offer, and exposes those tools to the
agent. Communication happens over a transport such as stdio (for local servers
launched as subprocesses) or HTTP/SSE (for remote servers).

The handshake is what makes MCP powerful. When a client connects, it asks the
server to list its tools. Each tool comes with a name, a human-readable
description, and a JSON schema describing its arguments. The agent uses these
descriptions to decide which tool to call and how to fill in the arguments. When
the agent calls a tool, the client forwards the request to the server, the
server runs it, and the result flows back to the model.

Because the interface is standardized, the same MCP server can be reused across
different agents and frameworks. This decoupling is the main benefit: tools and
agents evolve independently, and adding a capability is as simple as connecting
another server.
