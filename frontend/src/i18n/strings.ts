// All UI "chrome" strings (everything that isn't the curated learning content
// or the architecture data, which live localized in their own files). One
// object per language; the `Strings` interface keeps both in lockstep.

import type { TimelinePhase } from "../lib/phases";
import type { Lang } from "./index";

export interface Strings {
  app: {
    tagline: string;
    learn: string;
    simulator: string;
    liveTitle: string;
    language: string;
    cloud: string;
    theme: string;
    themeDark: string;
    themeLight: string;
    // Health banner (B9): backend unreachable, or up but missing the API key.
    offline: string;
    noKey: string;
  };
  chat: {
    title: string;
    subtitle: string;
    placeholder: string;
    running: string;
    send: string;
    answer: string;
    thinking: string;
    // 012-chat-flow-sync: running-status label per pipeline stage, shown in the
    // live chat bubble in step with the paced playhead (gerund form, parallel to
    // timeline.phases). `thinking` is the fallback before the first stage.
    stage: Record<TimelinePhase, string>;
    answerHint: string;
    examples: string[];
    // Conversation list ↔ thread (002-interactive-chat).
    conversations: string;
    newChat: string;
    empty: string;
    untitled: string;
    back: string;
    you: string;
    agent: string;
    sources: string;
    fromDoc: string;
    emptyThread: string;
    messages: (n: number) => string;
    uploadPdf: string;
    documents: string;
    removeDoc: string;
    chunksStored: (n: number) => string;
    uploading: string;
    uploadFailed: string;
    now: string;
    attachDoc: string;
    enterToSend: string;
    // 016-cancel-stream: the in-flight cancel control + the cancelled-state note.
    cancel: string;
    cancelled: string;
  };
  // 022-message-trace-link: revisit a past turn's trace on the canvas.
  trace: {
    clickToLoad: string;
    loaded: string;
    expired: string;
  };
  // 018-cumulative-hud: the per-conversation running totals + pre-send estimate.
  hud: {
    turns: string;
    tokens: string;
    cost: string;
    toolCalls: string;
    ragHits: string;
    partial: string;
    estimate: string;
    tokenizer: string;
  };
  inspector: {
    overviewTitle: string;
    overviewBody: string;
    overviewBack: string;
    techInfra: string;
    tier: string;
    role: string;
    hosting: string;
    cloudExample: (cloud: string) => string;
    networkHops: string;
    networkZone: string;
    controls: string;
    zonePublic: string;
    zonePrivate: string;
    events: (n: number) => string;
    historyRead: string;
    recentMessages: string;
    totalRows: string;
    noHistory: string;
    persisted: string;
    operation: string;
    requestSent: string;
    answerReceived: string;
    routes: string;
    query: string;
    agentLoop: string;
    reasoningTurns: string;
    lastDecision: string;
    queryEmbedding: string;
    model: string;
    dimensions: string;
    retrievedChunks: (n: number) => string;
    // PDF ingestion (002-interactive-chat).
    ingestion: string;
    chunkStrategy: string;
    chunkSize: string;
    tokensPerChunk: string;
    chunkPreviews: string;
    vectorsStored: string;
    totalInCollection: string;
    vectorPreview: string;
    fromDocument: string;
    discoveredTools: string;
    transport: string;
    toolCall: string;
    tool: string;
    args: string;
    result: string;
    // 017-failure-injection — label for an injected (simulated) failure block.
    simulatedError: string;
    // Raw protocol/data transparency (007-numeric-transparency).
    jsonrpc: string;
    request: string;
    response: string;
    requestBody: string;
    reconstructed: string;
    rank: string;
    distance: string;
    similarity: string;
    assembledPrompt: string;
    system: string;
    retrievedContext: string;
    tools: string;
    // The LLM assembled-prompt section also surfaces the USER message and the
    // folded-in conversation history (B3).
    userMessage: string;
    history: string;
    generatedAnswer: string;
    // Token usage + cost (011-token-cost).
    usageCost: string;
    rounds: string;
    promptTokens: string;
    completionTokens: string;
    totalTokens: string;
    cost: string;
    status: { active: string; done: string; idle: string };
  };
  comms: {
    sync: string; // chip word (technical, same in both languages)
    async: string;
    syncDetail: string; // blocking request/response
    asyncDetail: string; // streamed response
    deliveryStreamDetail: string; // frontend↔backend, stream mode
    deliveryBatchDetail: string; // frontend↔backend, batch mode
    llmStreamDetail: string; // agent→llm, stream mode
    llmBatchDetail: string; // agent→llm, batch mode
  };
  settings: {
    open: string;
    label: string;
    title: string;
    delivery: string;
    deliveryHint: string;
    streaming: string;
    streamingHint: string;
    batch: string;
    batchHint: string;
    // Real, working controls (006-interactive-experiments) — replaced the old
    // "SOON" Tools/RAG placeholders.
    experiment: {
      title: string;
      systemPrompt: string;
      promptHint: string;
      reset: string;
      tools: string;
      toolsHint: string;
      topK: string;
      topKHint: string;
      // Friendly per-tool labels, keyed by MCP tool name.
      toolLabels: Record<string, string>;
      // 017-failure-injection — the "Simulate failure" selector + its options,
      // keyed by SimulateFailure value (none / tool_error / llm_timeout).
      failure: {
        label: string;
        hint: string;
        modes: Record<string, string>;
      };
    };
    // 025-clear-databases — the "Clear databases" reset control + inline confirm.
    data: {
      title: string;
      clear: string;
      clearHint: string;
      confirm: string;
      confirmHint: string;
      confirmYes: string;
      cancel: string;
      clearing: string;
      cleared: string;
    };
  };
  // One-line plain-language hints for the dense tech tags on each station node,
  // keyed by the tag string (e.g. "ASGI", "cosine", "MCP"). Demystifies jargon.
  glossary: Record<string, string>;
  timeline: {
    title: string;
    hint: string;
    stepBack: string;
    pause: string;
    replay: string;
    stepForward: string;
    idle: string;
    // Named phase markers on the scrubber (004-timeline-phases).
    phases: Record<TimelinePhase, string>;
    // Per-phase latency waterfall (015-latency-waterfall). Phase bar names reuse
    // `phases`; only this chrome is new.
    timing: {
      title: string;
      total: string;
      overhead: string;
      empty: string;
    };
  };
  // Guided tour — storytelling playback (005-guided-tour, 014-tour-scripted).
  tour: {
    start: string;
    pause: string;
    resume: string;
    stop: string;
    // Empty-state call to action — ▶ Tour loads a bundled canned trace so a
    // first-time visitor can preview the journey before sending (014 AC6).
    ctaEmpty: string;
    // Terse per-phase captions — used as the phase-chip hover hint (004).
    captions: Record<TimelinePhase, string>;
    // Longer, scripted balloon narration anchored to the active station (014).
    narration: Record<TimelinePhase, string>;
  };
  readout: {
    answerReceived: string;
    fastapiSse: string;
    decisionAnswer: string;
    call: (names: string) => string;
    routing: string;
    embedding: string;
    toolsReady: (n: number) => string;
    promptAssembled: string;
    streaming: (n: number) => string;
    tokens: (n: number) => string;
    tokensCost: (tok: string, usd: string) => string; // 011-token-cost
    score: string;
    dbQuerying: string;
    dbHistory: (n: number) => string;
    dbPersisted: string;
    // PDF ingestion (002-interactive-chat).
    ingestChunking: (n: number) => string;
    ingestEmbedding: (n: number) => string;
    ingestStored: (n: number) => string;
    // 017-failure-injection — badge shown on the MCP/LLM readout when a run
    // carries an injected (simulated) failure.
    simulatedError: string;
  };
  node: {
    expand: string;
    collapse: string;
    openFull: string;
    memory: string;
    latency: string;
    tip: string;
    comingSoon: string;
  };
  scenario: {
    label: string;
    sendDisabled: string;
  };
  agentDetail: {
    title: string;
    subtitle: string;
    back: string;
    waiting: string;
    reactLoop: string;
    reason: string;
    act: string;
    observe: string;
    answer: string;
    iterations: string;
    lastDecision: string;
    workingMemory: string;
    workingMemoryHint: string;
    userMessage: string;
    scratchpad: string;
    noToolCalls: string;
    longTermMemory: string;
    longTermMemoryHint: string;
    conversationHistory: string;
    vectorMemory: string;
    noHistory: string;
    contextWindow: string;
    contextWindowHint: string;
    systemPrompt: string;
    retrievedContext: string;
    toolResults: string;
    history: string;
    tools: string;
    approxTokens: (n: number) => string;
    // 010-llm-as-brain — anatomy framing + real usage labels.
    brain: string;
    brainHint: string;
    senses: string;
    hands: string;
    speech: string;
    noAnswerYet: string;
    rounds: string;
    model: string;
    promptTokens: string;
    completionTokens: string;
    totalTokens: string;
    cost: string;
    approxProportion: string;
  };
  learn: {
    rootTitle: string;
    rootHint: string;
    whatItIs: string;
    whyUsed: string;
    inProject: string;
    howItWorks: string;
    otherOptions: string;
    studyLinks: string;
    onCloud: (label: string) => string;
    cloudGuideHint: (label: string) => string;
    moreIn: (title: string) => string;
    topicsCount: (n: number) => string;
    learnStackTitle: string;
    learnStackBody: string;
  };
}

const en: Strings = {
  app: {
    tagline:
      "A chat message's journey through RAG, MCP tools and an LLM — visualized live.",
    learn: "Learn",
    simulator: "Simulator",
    liveTitle: "Live OpenAI calls",
    language: "Language",
    cloud: "Cloud provider",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    offline:
      "Backend offline — start it with `docker compose up backend` (it needs OPENAI_API_KEY in backend/.env).",
    noKey:
      "No OPENAI_API_KEY set — the backend is up but can't run a turn. Add it to backend/.env and restart.",
  },
  chat: {
    title: "Ask the agent",
    subtitle: "Send a message and watch it travel through the pipeline on the right.",
    placeholder: "e.g. What is RAG?",
    running: "Running…",
    send: "Send message",
    answer: "Answer",
    thinking: "Thinking…",
    stage: {
      request: "Sending…",
      memory: "Recalling memory…",
      route: "Routing…",
      retrieve: "Retrieving…",
      reason: "Reasoning…",
      tools: "Calling tools…",
      generate: "Generating…",
      respond: "Responding…",
      persist: "Saving…",
    },
    answerHint: "The agent's answer will stream here.",
    examples: [
      "What is RAG and how does retrieval work?",
      "What is 12 * (3 + 1)?",
      "How do MCP tools work?",
      "What time is it right now?",
    ],
    conversations: "Conversations",
    newChat: "New chat",
    empty: "No conversations yet",
    untitled: "New conversation",
    back: "Conversations",
    you: "You",
    agent: "Agent",
    sources: "Sources used",
    fromDoc: "your PDF",
    emptyThread: "Send a message to start this conversation.",
    messages: (n) => `${n} message${n === 1 ? "" : "s"}`,
    uploadPdf: "Upload PDF",
    documents: "Documents",
    removeDoc: "Remove",
    chunksStored: (n) => `${n} chunk${n === 1 ? "" : "s"}`,
    uploading: "Ingesting…",
    uploadFailed: "Upload failed",
    now: "now",
    attachDoc: "Attach a PDF",
    enterToSend: "Enter to send",
    cancel: "Cancel",
    cancelled: "Run cancelled",
  },
  trace: {
    clickToLoad: "Click a message to load its trace",
    loaded: "Showing this turn's trace",
    expired: "Trace expired — no longer available",
  },
  hud: {
    turns: "turns",
    tokens: "tokens",
    cost: "cost",
    toolCalls: "tool calls",
    ragHits: "RAG hits",
    partial: "partial · some traces expired",
    estimate: "≈ estimate · not billed",
    tokenizer: "tiktoken · o200k_base",
  },
  inspector: {
    overviewTitle: "Inspector",
    overviewBody:
      "The pipeline is split into deployable tiers (containers) that talk over the network. Send a message, then click any station to inspect the real data — protocols and routes, retrieved chunks and scores, tool calls, the assembled prompt, and latency.",
    overviewBack: "← Overview",
    techInfra: "Technical & infrastructure",
    tier: "tier",
    role: "role (cloud-agnostic)",
    hosting: "hosting (e.g.)",
    cloudExample: (cloud) => `example · ${cloud}`,
    networkHops: "network hops",
    networkZone: "network zone",
    controls: "controls",
    zonePublic: "public internet",
    zonePrivate: "private network",
    events: (n) => `${n} event${n === 1 ? "" : "s"}`,
    historyRead: "Recent history (read)",
    recentMessages: "recent messages",
    totalRows: "rows stored",
    noHistory: "no prior conversations yet",
    persisted: "Conversation persisted (write)",
    operation: "operation",
    requestSent: "Request sent",
    answerReceived: "Answer received",
    routes: "Routes",
    query: "Query",
    agentLoop: "Agent loop",
    reasoningTurns: "reasoning turns",
    lastDecision: "last decision",
    queryEmbedding: "Query embedding",
    model: "model",
    dimensions: "dimensions",
    retrievedChunks: (n) => `Retrieved chunks (top-${n})`,
    ingestion: "PDF ingestion",
    chunkStrategy: "chunking strategy",
    chunkSize: "size / overlap",
    tokensPerChunk: "tokens per chunk",
    chunkPreviews: "chunk previews",
    vectorsStored: "vectors stored",
    totalInCollection: "total in collection",
    vectorPreview: "vector preview",
    fromDocument: "from your PDF",
    discoveredTools: "Discovered tools",
    transport: "transport",
    toolCall: "Tool call",
    tool: "tool",
    args: "args",
    result: "result",
    simulatedError: "⚠️ Simulated failure (injected)",
    jsonrpc: "JSON-RPC frames",
    request: "Request",
    response: "Response",
    requestBody: "Request body",
    reconstructed: "reconstructed (local fallback)",
    rank: "rank",
    distance: "distance",
    similarity: "similarity",
    assembledPrompt: "Assembled prompt",
    system: "system",
    retrievedContext: "retrieved context",
    tools: "tools",
    userMessage: "user message",
    history: "conversation history",
    generatedAnswer: "Generated answer",
    usageCost: "Usage & cost",
    rounds: "LLM rounds",
    promptTokens: "prompt tokens",
    completionTokens: "completion tokens",
    totalTokens: "total tokens",
    cost: "cost",
    status: { active: "active", done: "done", idle: "idle" },
  },
  comms: {
    sync: "sync",
    async: "async",
    syncDetail:
      "Synchronous request/response — the caller blocks until the result comes back.",
    asyncDetail:
      "Asynchronous streaming — the response flows back incrementally over a kept-open connection.",
    deliveryStreamDetail:
      "Streaming (SSE): trace events and the answer flow back live, token by token, over one kept-open connection.",
    deliveryBatchDetail:
      "Batch (JSON): one response after the backend finishes the whole run; the client then replays the trace.",
    llmStreamDetail: "stream=true — tokens are streamed back as the model generates them.",
    llmBatchDetail: "Non-streaming — the full answer returns in a single response.",
  },
  settings: {
    open: "Architecture options",
    label: "Config",
    title: "Architecture options",
    delivery: "Response delivery",
    deliveryHint: "How the backend returns the result to the browser.",
    streaming: "Streaming (SSE)",
    streamingHint: "Watch each stage light up live; the answer types itself out.",
    batch: "Batch (JSON)",
    batchHint: "Wait for one JSON response, then replay the trace; the answer appears at once.",
    experiment: {
      title: "Experiment",
      systemPrompt: "System prompt",
      promptHint: "Edit the agent's instructions and watch the assembled prompt change.",
      reset: "Reset to default",
      tools: "Tools (MCP)",
      toolsHint: "Turn tools off and watch the agent re-plan without them.",
      topK: "Retrieved chunks (top-k)",
      topKHint: "How many chunks RAG pulls per query.",
      toolLabels: {
        calculator: "Calculator",
        current_time: "Current time",
        kb_lookup: "Glossary lookup",
      },
      failure: {
        label: "Simulate failure",
        hint: "Force a failure on the next run and watch the agent degrade.",
        modes: {
          none: "Off",
          tool_error: "Tool error",
          llm_timeout: "LLM timeout",
        },
      },
    },
    data: {
      title: "Data",
      clear: "Clear databases",
      clearHint:
        "Wipe all saved conversations and imported document chunks. The built-in knowledge base is kept.",
      confirm: "Clear all data?",
      confirmHint: "Deletes every conversation and every uploaded chunk. This can't be undone.",
      confirmYes: "Yes, clear",
      cancel: "Cancel",
      clearing: "Clearing…",
      cleared: "Cleared {sessions} conversations · {chunks} chunks",
    },
  },
  glossary: {
    "TLS 1.3": "TLS 1.3 — the encryption that secures HTTPS between the browser and the server.",
    ASGI: "ASGI — the asynchronous Python web-server interface FastAPI runs on.",
    ReAct: "ReAct — the reason → act → observe loop the agent repeats until it can answer.",
    DeepAgents:
      "DeepAgents — a LangGraph agent pattern adding planning, sub-agents, and a virtual file system for longer-horizon tasks. (Planned — not yet implemented.)",
    "Multi-agent":
      "Multi-agent — several specialized agents that coordinate (e.g. an orchestrator delegating to sub-agents) instead of one monolithic loop. (Planned — not yet implemented.)",
    SQL: "SQL — the query language of the relational database that stores the conversation.",
    cosine: "Cosine similarity — how the vector store ranks chunks by closeness of meaning.",
    MCP: "MCP (Model Context Protocol) — the open standard the agent uses to discover and call tools.",
    stream: "Streaming — tokens are sent to the browser as they're generated, over SSE.",
  },
  timeline: {
    title: "Replay & step",
    hint: "Click a phase or step ◀ ▶ through every stage of the request.",
    stepBack: "Step back",
    pause: "Pause",
    replay: "Replay",
    stepForward: "Step forward",
    idle: "idle",
    phases: {
      request: "Request",
      memory: "Memory",
      route: "Route",
      retrieve: "Retrieve",
      reason: "Reason",
      tools: "Tools",
      generate: "Generate",
      respond: "Respond",
      persist: "Persist",
    },
    timing: {
      title: "Timing breakdown",
      total: "Total",
      overhead: "overhead / transit",
      empty: "Run a turn to see where the time went.",
    },
  },
  tour: {
    start: "▶ Tour",
    pause: "Pause tour",
    resume: "Resume tour",
    stop: "Stop tour",
    ctaEmpty: "▶ Preview the journey",
    captions: {
      request: "The browser sends your message to the API over HTTPS.",
      memory: "The backend loads recent conversation history — long-term memory.",
      route: "The agent classifies the request and plans its route.",
      retrieve: "RAG embeds the query and pulls the most relevant chunks.",
      reason: "The agent reasons over the context and decides whether to call a tool.",
      tools: "A tool runs over MCP and returns an observation.",
      generate: "The model writes the answer, token by token.",
      respond: "The finished answer is streamed back to the client.",
      persist: "The conversation is saved to the database for next time.",
    },
    narration: {
      request:
        "👉 Your message leaves the browser and travels to the API over HTTPS — the request begins here.",
      memory:
        "👉 The backend reads recent turns from the database — the agent's long-term memory.",
      route: "👉 The agent reads the request and plans its route before doing any work.",
      retrieve:
        "👉 RAG turns your question into a vector and pulls the most relevant chunks from the index.",
      reason:
        "👉 The model reasons over the assembled context and decides whether it needs a tool.",
      tools: "👉 A tool runs over MCP and hands an observation back to the agent to reason on.",
      generate: "👉 With everything in hand, the model writes the answer one token at a time.",
      respond: "👉 The finished answer streams back across the network to your browser.",
      persist: "👉 The turn is written to the database so the next message remembers this one.",
    },
  },
  readout: {
    answerReceived: "answer received ✓",
    fastapiSse: "FastAPI · SSE stream",
    decisionAnswer: "decision: answer",
    call: (names) => `call → ${names}`,
    routing: "routing…",
    embedding: "embedding query…",
    toolsReady: (n) => `${n} tools ready`,
    promptAssembled: "prompt assembled",
    streaming: (n) => `streaming · ${n} tok`,
    tokens: (n) => `${n} tokens`,
    tokensCost: (tok, usd) => `${tok} tok · ${usd}`,
    score: "score",
    dbQuerying: "querying…",
    dbHistory: (n) => `history: ${n} rows`,
    dbPersisted: "persisted ✓",
    ingestChunking: (n) => `chunking · ${n}`,
    ingestEmbedding: (n) => `embedding ${n} vec`,
    ingestStored: (n) => `stored ${n} ✓`,
    simulatedError: "⚠️ simulated failure",
  },
  node: {
    expand: "Expand",
    collapse: "Collapse",
    openFull: "Open full view",
    memory: "memory",
    latency: "latency",
    tip: "Click a station to inspect · ⊕ to expand",
    comingSoon: "Coming soon",
  },
  scenario: {
    label: "Scenario",
    sendDisabled: "This scenario is a preview — switch to Simple to send a message.",
  },
  agentDetail: {
    title: "Agent — anatomy",
    subtitle: "The anatomy of an AI agent: a brain (the LLM), memory, and tools",
    back: "Back to canvas",
    waiting: "Send a message to watch the agent reason, remember and act.",
    reactLoop: "ReAct loop",
    reason: "reason",
    act: "act · tool",
    observe: "observe",
    answer: "answer",
    iterations: "iterations",
    lastDecision: "last decision",
    workingMemory: "Working memory",
    workingMemoryHint: "this request's state — lost when it ends",
    userMessage: "user message",
    scratchpad: "tool scratchpad (act → observe)",
    noToolCalls: "no tools called this run",
    longTermMemory: "Long-term memory",
    longTermMemoryHint: "survives across requests",
    conversationHistory: "conversation history · app DB",
    vectorMemory: "vector memory · RAG knowledge base",
    noHistory: "no earlier conversations",
    contextWindow: "Context window",
    contextWindowHint: "what is actually assembled and sent to the LLM",
    systemPrompt: "system prompt",
    retrievedContext: "retrieved context · RAG",
    toolResults: "tool results",
    history: "history",
    tools: "available tools",
    approxTokens: (n) => `~${n} tokens`,
    brain: "Brain · the LLM",
    brainHint: "every reasoning round is a call to the model",
    senses: "Input · the message",
    hands: "Tools · the agent's hands",
    speech: "Answer · what it says",
    noAnswerYet: "no answer yet",
    rounds: "LLM rounds",
    model: "model",
    promptTokens: "prompt tokens",
    completionTokens: "completion tokens",
    totalTokens: "total tokens",
    cost: "cost (USD)",
    approxProportion: "approx. proportion of the context",
  },
  learn: {
    rootTitle: "How this app works",
    rootHint: "A learning map — click any topic",
    whatItIs: "What it is",
    whyUsed: "Why it's used here",
    inProject: "In the project",
    howItWorks: "How it works",
    otherOptions: "Other options",
    studyLinks: "Study links",
    onCloud: (label) => `On ${label}`,
    cloudGuideHint: (label) => `Managed services to build this on ${label}`,
    moreIn: (title) => `More in ${title}`,
    topicsCount: (n) => `${n} topics`,
    learnStackTitle: "Learn the stack",
    learnStackBody:
      "This map explains how the simulator is built — its architecture and layers, the software and Gen-AI concepts it uses (and why), the security at each layer, the networking and infrastructure, and where data lives. Click any node to read about it.",
  },
};

const pt: Strings = {
  app: {
    tagline:
      "A jornada de uma mensagem de chat por RAG, ferramentas MCP e um LLM — visualizada ao vivo.",
    learn: "Aprender",
    simulator: "Simulador",
    liveTitle: "Chamadas reais à OpenAI",
    language: "Idioma",
    cloud: "Provedor de nuvem",
    theme: "Tema",
    themeDark: "Escuro",
    themeLight: "Claro",
    offline:
      "Backend offline — suba com `docker compose up backend` (precisa de OPENAI_API_KEY em backend/.env).",
    noKey:
      "Sem OPENAI_API_KEY — o backend está no ar mas não roda um turno. Adicione em backend/.env e reinicie.",
  },
  chat: {
    title: "Pergunte ao agente",
    subtitle: "Envie uma mensagem e acompanhe-a percorrendo o pipeline à direita.",
    placeholder: "ex.: O que é RAG?",
    running: "Executando…",
    send: "Enviar mensagem",
    answer: "Resposta",
    thinking: "Pensando…",
    stage: {
      request: "Enviando…",
      memory: "Lendo memória…",
      route: "Roteando…",
      retrieve: "Recuperando…",
      reason: "Raciocinando…",
      tools: "Chamando ferramentas…",
      generate: "Gerando…",
      respond: "Respondendo…",
      persist: "Salvando…",
    },
    answerHint: "A resposta do agente aparecerá aqui.",
    examples: [
      "O que é RAG e como funciona a recuperação?",
      "Quanto é 12 * (3 + 1)?",
      "Como funcionam as ferramentas MCP?",
      "Que horas são agora?",
    ],
    conversations: "Conversas",
    newChat: "Nova conversa",
    empty: "Ainda sem conversas",
    untitled: "Nova conversa",
    back: "Conversas",
    you: "Você",
    agent: "Agente",
    sources: "Fontes usadas",
    fromDoc: "seu PDF",
    emptyThread: "Envie uma mensagem para começar esta conversa.",
    messages: (n) => `${n} mensage${n === 1 ? "m" : "ns"}`,
    uploadPdf: "Enviar PDF",
    documents: "Documentos",
    removeDoc: "Remover",
    chunksStored: (n) => `${n} trecho${n === 1 ? "" : "s"}`,
    uploading: "Processando…",
    uploadFailed: "Falha no envio",
    now: "agora",
    attachDoc: "Anexar um PDF",
    enterToSend: "Enter para enviar",
    cancel: "Cancelar",
    cancelled: "Execução cancelada",
  },
  trace: {
    clickToLoad: "Clique numa mensagem para carregar seu trace",
    loaded: "Mostrando o trace deste turno",
    expired: "Trace expirado — não está mais disponível",
  },
  hud: {
    turns: "turnos",
    tokens: "tokens",
    cost: "custo",
    toolCalls: "chamadas de ferramenta",
    ragHits: "acertos de RAG",
    partial: "parcial · alguns traces expiraram",
    estimate: "≈ estimativa · não cobrado",
    tokenizer: "tiktoken · o200k_base",
  },
  inspector: {
    overviewTitle: "Inspetor",
    overviewBody:
      "O pipeline é dividido em camadas implantáveis (containers) que se comunicam pela rede. Envie uma mensagem e clique em qualquer estação para inspecionar os dados reais — protocolos e rotas, trechos recuperados e seus scores, chamadas de ferramentas, o prompt montado e a latência.",
    overviewBack: "← Visão geral",
    techInfra: "Técnico e infraestrutura",
    tier: "camada",
    role: "papel (agnóstico de nuvem)",
    hosting: "hospedagem (ex.)",
    cloudExample: (cloud) => `exemplo · ${cloud}`,
    networkHops: "saltos de rede",
    networkZone: "zona de rede",
    controls: "controles",
    zonePublic: "internet pública",
    zonePrivate: "rede privada",
    events: (n) => `${n} evento${n === 1 ? "" : "s"}`,
    historyRead: "Histórico recente (leitura)",
    recentMessages: "mensagens recentes",
    totalRows: "linhas armazenadas",
    noHistory: "ainda sem conversas anteriores",
    persisted: "Conversa persistida (escrita)",
    operation: "operação",
    requestSent: "Requisição enviada",
    answerReceived: "Resposta recebida",
    routes: "Rotas",
    query: "Consulta",
    agentLoop: "Loop do agente",
    reasoningTurns: "ciclos de raciocínio",
    lastDecision: "última decisão",
    queryEmbedding: "Embedding da consulta",
    model: "modelo",
    dimensions: "dimensões",
    retrievedChunks: (n) => `Trechos recuperados (top-${n})`,
    ingestion: "Ingestão de PDF",
    chunkStrategy: "estratégia de chunking",
    chunkSize: "tamanho / sobreposição",
    tokensPerChunk: "tokens por trecho",
    chunkPreviews: "prévias dos trechos",
    vectorsStored: "vetores armazenados",
    totalInCollection: "total na coleção",
    vectorPreview: "prévia do vetor",
    fromDocument: "do seu PDF",
    discoveredTools: "Ferramentas descobertas",
    transport: "transporte",
    toolCall: "Chamada de ferramenta",
    tool: "ferramenta",
    args: "args",
    result: "resultado",
    simulatedError: "⚠️ Falha simulada (injetada)",
    jsonrpc: "Frames JSON-RPC",
    request: "Requisição",
    response: "Resposta",
    requestBody: "Corpo da requisição",
    reconstructed: "reconstruído (fallback local)",
    rank: "posição",
    distance: "distância",
    similarity: "similaridade",
    assembledPrompt: "Prompt montado",
    system: "sistema",
    retrievedContext: "contexto recuperado",
    tools: "ferramentas",
    userMessage: "mensagem do usuário",
    history: "histórico de conversas",
    generatedAnswer: "Resposta gerada",
    usageCost: "Uso e custo",
    rounds: "Rodadas da LLM",
    promptTokens: "tokens de prompt",
    completionTokens: "tokens de resposta",
    totalTokens: "tokens totais",
    cost: "custo",
    status: { active: "ativo", done: "concluído", idle: "ocioso" },
  },
  comms: {
    sync: "sync",
    async: "async",
    syncDetail:
      "Requisição/resposta síncrona — o chamador bloqueia até o resultado voltar.",
    asyncDetail:
      "Streaming assíncrono — a resposta volta de forma incremental por uma conexão mantida aberta.",
    deliveryStreamDetail:
      "Streaming (SSE): os eventos de trace e a resposta voltam ao vivo, token a token, por uma única conexão mantida aberta.",
    deliveryBatchDetail:
      "Batch (JSON): uma resposta após o backend concluir toda a execução; o cliente então repete o trace.",
    llmStreamDetail: "stream=true — os tokens são transmitidos conforme o modelo os gera.",
    llmBatchDetail: "Sem streaming — a resposta completa volta em uma única resposta.",
  },
  settings: {
    open: "Opções de arquitetura",
    label: "Config",
    title: "Opções de arquitetura",
    delivery: "Entrega da resposta",
    deliveryHint: "Como o backend devolve o resultado ao navegador.",
    streaming: "Streaming (SSE)",
    streamingHint: "Veja cada etapa acender ao vivo; a resposta vai sendo digitada.",
    batch: "Batch (JSON)",
    batchHint: "Aguarde uma resposta JSON única e então repita o trace; a resposta aparece de uma vez.",
    experiment: {
      title: "Experimentar",
      systemPrompt: "Prompt de sistema",
      promptHint: "Edite as instruções do agente e veja o prompt montado mudar.",
      reset: "Restaurar padrão",
      tools: "Ferramentas (MCP)",
      toolsHint: "Desligue ferramentas e veja o agente replanejar sem elas.",
      topK: "Trechos recuperados (top-k)",
      topKHint: "Quantos trechos o RAG busca por consulta.",
      toolLabels: {
        calculator: "Calculadora",
        current_time: "Hora atual",
        kb_lookup: "Consulta ao glossário",
      },
      failure: {
        label: "Simular falha",
        hint: "Force uma falha na próxima execução e veja o agente degradar.",
        modes: {
          none: "Desligado",
          tool_error: "Erro de ferramenta",
          llm_timeout: "Timeout do modelo",
        },
      },
    },
    data: {
      title: "Dados",
      clear: "Limpar bancos de dados",
      clearHint:
        "Apaga todas as conversas salvas e os chunks de documentos importados. A base de conhecimento embutida é mantida.",
      confirm: "Limpar todos os dados?",
      confirmHint: "Apaga todas as conversas e todos os chunks enviados. Isto não pode ser desfeito.",
      confirmYes: "Sim, limpar",
      cancel: "Cancelar",
      clearing: "Limpando…",
      cleared: "Limpou {sessions} conversas · {chunks} chunks",
    },
  },
  glossary: {
    "TLS 1.3": "TLS 1.3 — a criptografia que protege o HTTPS entre o navegador e o servidor.",
    ASGI: "ASGI — a interface assíncrona de servidor web Python sobre a qual o FastAPI roda.",
    ReAct: "ReAct — o loop raciocinar → agir → observar que o agente repete até poder responder.",
    DeepAgents:
      "DeepAgents — um padrão de agente LangGraph que adiciona planejamento, subagentes e um sistema de arquivos virtual para tarefas de horizonte mais longo. (Planejado — ainda não implementado.)",
    "Multi-agent":
      "Multi-agente — vários agentes especializados que se coordenam (ex.: um orquestrador delegando a subagentes) em vez de um único loop monolítico. (Planejado — ainda não implementado.)",
    SQL: "SQL — a linguagem de consulta do banco relacional que guarda a conversa.",
    cosine: "Similaridade de cosseno — como o banco vetorial ordena os trechos pela proximidade de significado.",
    MCP: "MCP (Model Context Protocol) — o padrão aberto que o agente usa para descobrir e chamar ferramentas.",
    stream: "Streaming — os tokens são enviados ao navegador conforme são gerados, via SSE.",
  },
  timeline: {
    title: "Replay e passo a passo",
    hint: "Clique numa fase ou avance ◀ ▶ etapa por etapa por toda a requisição.",
    stepBack: "Voltar um passo",
    pause: "Pausar",
    replay: "Repetir",
    stepForward: "Avançar um passo",
    idle: "ocioso",
    phases: {
      request: "Requisição",
      memory: "Memória",
      route: "Roteamento",
      retrieve: "Recuperação",
      reason: "Raciocínio",
      tools: "Ferramentas",
      generate: "Geração",
      respond: "Resposta",
      persist: "Persistência",
    },
    timing: {
      title: "Quebra de tempo",
      total: "Total",
      overhead: "sobrecarga / trânsito",
      empty: "Rode um turno para ver para onde foi o tempo.",
    },
  },
  tour: {
    start: "▶ Tour",
    pause: "Pausar tour",
    resume: "Retomar tour",
    stop: "Encerrar tour",
    ctaEmpty: "▶ Pré-visualizar a jornada",
    captions: {
      request: "O navegador envia sua mensagem à API por HTTPS.",
      memory: "O backend carrega o histórico recente da conversa — memória de longo prazo.",
      route: "O agente classifica a requisição e planeja a rota.",
      retrieve: "O RAG vetoriza a pergunta e busca os trechos mais relevantes.",
      reason: "O agente raciocina sobre o contexto e decide se chama uma ferramenta.",
      tools: "Uma ferramenta roda via MCP e retorna uma observação.",
      generate: "O modelo escreve a resposta, token a token.",
      respond: "A resposta pronta é transmitida de volta ao cliente.",
      persist: "A conversa é salva no banco para a próxima vez.",
    },
    narration: {
      request:
        "👉 Sua mensagem sai do navegador e viaja até a API por HTTPS — a requisição começa aqui.",
      memory:
        "👉 O backend lê os turnos recentes do banco — a memória de longo prazo do agente.",
      route: "👉 O agente lê a requisição e planeja sua rota antes de qualquer trabalho.",
      retrieve:
        "👉 O RAG transforma sua pergunta em vetor e busca os trechos mais relevantes no índice.",
      reason:
        "👉 O modelo raciocina sobre o contexto montado e decide se precisa de uma ferramenta.",
      tools: "👉 Uma ferramenta roda via MCP e devolve uma observação para o agente raciocinar.",
      generate: "👉 Com tudo em mãos, o modelo escreve a resposta um token por vez.",
      respond: "👉 A resposta pronta volta pela rede, em streaming, até o seu navegador.",
      persist: "👉 O turno é salvo no banco para que a próxima mensagem lembre desta.",
    },
  },
  readout: {
    answerReceived: "resposta recebida ✓",
    fastapiSse: "FastAPI · stream SSE",
    decisionAnswer: "decisão: responder",
    call: (names) => `chamar → ${names}`,
    routing: "roteando…",
    embedding: "incorporando consulta…",
    toolsReady: (n) => `${n} ferramentas prontas`,
    promptAssembled: "prompt montado",
    streaming: (n) => `transmitindo · ${n} tok`,
    tokens: (n) => `${n} tokens`,
    tokensCost: (tok, usd) => `${tok} tok · ${usd}`,
    score: "score",
    dbQuerying: "consultando…",
    dbHistory: (n) => `histórico: ${n} linhas`,
    dbPersisted: "persistido ✓",
    ingestChunking: (n) => `dividindo · ${n}`,
    ingestEmbedding: (n) => `incorporando ${n} vec`,
    ingestStored: (n) => `${n} armazenados ✓`,
    simulatedError: "⚠️ falha simulada",
  },
  node: {
    expand: "Expandir",
    collapse: "Recolher",
    openFull: "Abrir visão completa",
    memory: "memória",
    latency: "latência",
    tip: "Clique numa estação para inspecionar · ⊕ para expandir",
    comingSoon: "Em breve",
  },
  scenario: {
    label: "Cenário",
    sendDisabled: "Este cenário é um preview — troque para Simples para enviar uma mensagem.",
  },
  agentDetail: {
    title: "Agente — anatomia",
    subtitle: "A anatomia de um agente de IA: um cérebro (a LLM), memória e ferramentas",
    back: "Voltar ao canvas",
    waiting: "Envie uma mensagem para ver o agente raciocinar, lembrar e agir.",
    reactLoop: "Loop ReAct",
    reason: "raciocinar",
    act: "agir · ferramenta",
    observe: "observar",
    answer: "responder",
    iterations: "iterações",
    lastDecision: "última decisão",
    workingMemory: "Memória de trabalho",
    workingMemoryHint: "o estado desta requisição — perdido ao terminar",
    userMessage: "mensagem do usuário",
    scratchpad: "rascunho de ferramentas (agir → observar)",
    noToolCalls: "nenhuma ferramenta chamada nesta execução",
    longTermMemory: "Memória de longo prazo",
    longTermMemoryHint: "sobrevive entre requisições",
    conversationHistory: "histórico de conversas · banco da app",
    vectorMemory: "memória vetorial · base de conhecimento RAG",
    noHistory: "sem conversas anteriores",
    contextWindow: "Janela de contexto",
    contextWindowHint: "o que de fato é montado e enviado ao LLM",
    systemPrompt: "prompt de sistema",
    retrievedContext: "contexto recuperado · RAG",
    toolResults: "resultados de ferramentas",
    history: "histórico",
    tools: "ferramentas disponíveis",
    approxTokens: (n) => `~${n} tokens`,
    brain: "Cérebro · a LLM",
    brainHint: "cada rodada de raciocínio é uma chamada ao modelo",
    senses: "Entrada · a mensagem",
    hands: "Ferramentas · as mãos do agente",
    speech: "Resposta · o que ele diz",
    noAnswerYet: "ainda sem resposta",
    rounds: "Rodadas da LLM",
    model: "modelo",
    promptTokens: "tokens de prompt",
    completionTokens: "tokens de resposta",
    totalTokens: "tokens totais",
    cost: "custo (US$)",
    approxProportion: "proporção aprox. do contexto",
  },
  learn: {
    rootTitle: "Como este app funciona",
    rootHint: "Um mapa de aprendizado — clique em qualquer tópico",
    whatItIs: "O que é",
    whyUsed: "Por que é usado aqui",
    inProject: "No projeto",
    howItWorks: "Como funciona",
    otherOptions: "Outras opções",
    studyLinks: "Para estudar",
    onCloud: (label) => `Em ${label}`,
    cloudGuideHint: (label) => `Serviços gerenciados para construir isto em ${label}`,
    moreIn: (title) => `Mais em ${title}`,
    topicsCount: (n) => `${n} tópicos`,
    learnStackTitle: "Aprenda a stack",
    learnStackBody:
      "Este mapa explica como o simulador é construído — sua arquitetura e camadas, os conceitos de software e Gen AI que utiliza (e por quê), a segurança em cada camada, a rede e a infraestrutura, e onde os dados ficam. Clique em qualquer nó para ler sobre ele.",
  },
};

export const UI: Record<Lang, Strings> = { en, pt };
