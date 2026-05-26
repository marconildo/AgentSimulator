// All UI "chrome" strings (everything that isn't the curated learning content
// or the architecture data, which live localized in their own files). One
// object per language; the `Strings` interface keeps both in lockstep.

import type { Lang } from "./index";

export interface Strings {
  app: {
    tagline: string;
    learn: string;
    simulator: string;
    demoMode: string;
    demoTitle: string;
    liveTitle: string;
    language: string;
    cloud: string;
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
    demoModeKey: string;
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
  timeline: {
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
    demoMode: "demo mode",
    demoTitle: "Deterministic mock — no API key",
    liveTitle: "Live OpenAI calls",
    language: "Language",
    cloud: "Cloud provider",
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
    demoModeKey: "demo mode",
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
  timeline: {
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
    demoMode: "modo demo",
    demoTitle: "Mock determinístico — sem chave de API",
    liveTitle: "Chamadas reais à OpenAI",
    language: "Idioma",
    cloud: "Provedor de nuvem",
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
    demoModeKey: "modo demo",
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
  timeline: {
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
