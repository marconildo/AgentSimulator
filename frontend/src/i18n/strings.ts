// All UI "chrome" strings (everything that isn't the curated learning content
// or the architecture data, which live localized in their own files). One
// object per language; the `Strings` interface keeps both in lockstep.

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
  };
  chat: {
    title: string;
    subtitle: string;
    placeholder: string;
    running: string;
    send: string;
    answer: string;
    thinking: string;
    answerHint: string;
    examples: string[];
  };
  inspector: {
    overviewTitle: string;
    overviewBody: string;
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
    discoveredTools: string;
    transport: string;
    toolCall: string;
    tool: string;
    args: string;
    result: string;
    assembledPrompt: string;
    system: string;
    retrievedContext: string;
    tools: string;
    generatedAnswer: string;
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
    title: string;
    delivery: string;
    deliveryHint: string;
    streaming: string;
    streamingHint: string;
    batch: string;
    batchHint: string;
    soon: string;
    tools: string;
    rag: string;
    moreSoon: string;
  };
  timeline: {
    title: string;
    hint: string;
    stepBack: string;
    pause: string;
    replay: string;
    stepForward: string;
    idle: string;
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
    score: string;
    dbQuerying: string;
    dbHistory: (n: number) => string;
    dbPersisted: string;
  };
  node: {
    expand: string;
    collapse: string;
    openFull: string;
    memory: string;
    tip: string;
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
  };
  learn: {
    rootTitle: string;
    rootHint: string;
    whatItIs: string;
    whyUsed: string;
    inProject: string;
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
  },
  chat: {
    title: "Ask the agent",
    subtitle: "Send a message and watch it travel through the pipeline on the right.",
    placeholder: "e.g. What is RAG?",
    running: "Running…",
    send: "Send message",
    answer: "Answer",
    thinking: "Thinking…",
    answerHint: "The agent's answer will stream here.",
    examples: [
      "What is RAG and how does retrieval work?",
      "What is 12 * (3 + 1)?",
      "How do MCP tools work?",
      "What time is it right now?",
    ],
  },
  inspector: {
    overviewTitle: "Inspector",
    overviewBody:
      "The pipeline is split into deployable tiers (containers) that talk over the network. Send a message, then click any station to inspect the real data — protocols and routes, retrieved chunks and scores, tool calls, the assembled prompt, and latency.",
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
    discoveredTools: "Discovered tools",
    transport: "transport",
    toolCall: "Tool call",
    tool: "tool",
    args: "args",
    result: "result",
    assembledPrompt: "Assembled prompt",
    system: "system",
    retrievedContext: "retrieved context",
    tools: "tools",
    generatedAnswer: "Generated answer",
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
    title: "Architecture options",
    delivery: "Response delivery",
    deliveryHint: "How the backend returns the result to the browser.",
    streaming: "Streaming (SSE)",
    streamingHint: "Watch each stage light up live; the answer types itself out.",
    batch: "Batch (JSON)",
    batchHint: "Wait for one JSON response, then replay the trace; the answer appears at once.",
    soon: "soon",
    tools: "Tools (MCP)",
    rag: "RAG retrieval",
    moreSoon: "More options coming soon.",
  },
  timeline: {
    title: "Replay & step",
    hint: "Drag the slider or step ◀ ▶ through every stage of the request.",
    stepBack: "Step back",
    pause: "Pause",
    replay: "Replay",
    stepForward: "Step forward",
    idle: "idle",
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
    score: "score",
    dbQuerying: "querying…",
    dbHistory: (n) => `history: ${n} rows`,
    dbPersisted: "persisted ✓",
  },
  node: {
    expand: "Expand",
    collapse: "Collapse",
    openFull: "Open full view",
    memory: "memory",
    tip: "Click a station to inspect · ⊕ to expand",
  },
  agentDetail: {
    title: "Agent — inside the loop",
    subtitle: "How an AI agent reasons, remembers and acts",
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
  },
  learn: {
    rootTitle: "How this app works",
    rootHint: "A learning map — click any topic",
    whatItIs: "What it is",
    whyUsed: "Why it's used here",
    inProject: "In the project",
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
  },
  chat: {
    title: "Pergunte ao agente",
    subtitle: "Envie uma mensagem e acompanhe-a percorrendo o pipeline à direita.",
    placeholder: "ex.: O que é RAG?",
    running: "Executando…",
    send: "Enviar mensagem",
    answer: "Resposta",
    thinking: "Pensando…",
    answerHint: "A resposta do agente aparecerá aqui.",
    examples: [
      "O que é RAG e como funciona a recuperação?",
      "Quanto é 12 * (3 + 1)?",
      "Como funcionam as ferramentas MCP?",
      "Que horas são agora?",
    ],
  },
  inspector: {
    overviewTitle: "Inspetor",
    overviewBody:
      "O pipeline é dividido em camadas implantáveis (containers) que se comunicam pela rede. Envie uma mensagem e clique em qualquer estação para inspecionar os dados reais — protocolos e rotas, trechos recuperados e seus scores, chamadas de ferramentas, o prompt montado e a latência.",
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
    discoveredTools: "Ferramentas descobertas",
    transport: "transporte",
    toolCall: "Chamada de ferramenta",
    tool: "ferramenta",
    args: "args",
    result: "resultado",
    assembledPrompt: "Prompt montado",
    system: "sistema",
    retrievedContext: "contexto recuperado",
    tools: "ferramentas",
    generatedAnswer: "Resposta gerada",
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
    title: "Opções de arquitetura",
    delivery: "Entrega da resposta",
    deliveryHint: "Como o backend devolve o resultado ao navegador.",
    streaming: "Streaming (SSE)",
    streamingHint: "Veja cada etapa acender ao vivo; a resposta vai sendo digitada.",
    batch: "Batch (JSON)",
    batchHint: "Aguarde uma resposta JSON única e então repita o trace; a resposta aparece de uma vez.",
    soon: "em breve",
    tools: "Ferramentas (MCP)",
    rag: "Recuperação RAG",
    moreSoon: "Mais opções em breve.",
  },
  timeline: {
    title: "Replay e passo a passo",
    hint: "Arraste o controle ou avance ◀ ▶ etapa por etapa por toda a requisição.",
    stepBack: "Voltar um passo",
    pause: "Pausar",
    replay: "Repetir",
    stepForward: "Avançar um passo",
    idle: "ocioso",
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
    score: "score",
    dbQuerying: "consultando…",
    dbHistory: (n) => `histórico: ${n} linhas`,
    dbPersisted: "persistido ✓",
  },
  node: {
    expand: "Expandir",
    collapse: "Recolher",
    openFull: "Abrir visão completa",
    memory: "memória",
    tip: "Clique numa estação para inspecionar · ⊕ para expandir",
  },
  agentDetail: {
    title: "Agente — dentro do loop",
    subtitle: "Como um agente de IA raciocina, lembra e age",
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
  },
  learn: {
    rootTitle: "Como este app funciona",
    rootHint: "Um mapa de aprendizado — clique em qualquer tópico",
    whatItIs: "O que é",
    whyUsed: "Por que é usado aqui",
    inProject: "No projeto",
    moreIn: (title) => `Mais em ${title}`,
    topicsCount: (n) => `${n} tópicos`,
    learnStackTitle: "Aprenda a stack",
    learnStackBody:
      "Este mapa explica como o simulador é construído — sua arquitetura e camadas, os conceitos de software e Gen AI que utiliza (e por quê), a segurança em cada camada, a rede e a infraestrutura, e onde os dados ficam. Clique em qualquer nó para ler sobre ele.",
  },
};

export const UI: Record<Lang, Strings> = { en, pt };
