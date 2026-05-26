// Curated learning content for the "Learn" page — a roadmap.sh-style map that
// explains this project's architecture, the software & Gen-AI concepts it uses
// (and why), security per layer, networking/infra, and databases.
//
// Everything is grounded in the actual codebase, so it doubles as documentation.
//
// Prose is authored as `{ en, pt }`; structural data (ids, icons, accents) and
// code/file-path references stay plain. Use `sectionsFor(lang)` /
// `allTopicsFor(lang)` to get fully-resolved, plain-string content (cached per
// language so references stay stable across renders).

import type { Lang } from "../i18n";

/** A translatable string: either identical across languages, or per-language. */
type Tr = string | { en: string; pt: string };
const r = (v: Tr, lang: Lang): string => (typeof v === "string" ? v : v[lang]);

// --- Resolved (public) types — what components consume, all plain strings ----

export interface Topic {
  id: string;
  title: string;
  what: string; // what it is
  why: string; // why it's used here
  where?: string; // where to find it in the project
}

export interface Section {
  id: string;
  title: string;
  icon: string;
  accent: string;
  intro: string;
  topics: Topic[];
}

// --- Source data (translatable fields as `Tr`) -------------------------------

type TopicSrc = Omit<Topic, "title" | "what" | "why"> & { title: Tr; what: Tr; why: Tr };
type SectionSrc = Omit<Section, "title" | "intro" | "topics"> & {
  title: Tr;
  intro: Tr;
  topics: TopicSrc[];
};

const SECTIONS_SRC: SectionSrc[] = [
  {
    id: "architecture",
    title: { en: "Architecture & Layers", pt: "Arquitetura e Camadas" },
    icon: "🏛️",
    accent: "#38bdf8",
    intro: {
      en: "The app is split into independent layers (tiers). Each is a separate container that can be built, deployed, scaled and secured on its own.",
      pt: "O app é dividido em camadas independentes (tiers). Cada uma é um container separado que pode ser construído, implantado, escalado e protegido por conta própria.",
    },
    topics: [
      {
        id: "project-structure",
        title: { en: "Project structure", pt: "Estrutura do projeto" },
        what: {
          en: "A monorepo with backend/ (FastAPI + LangGraph agent, RAG, MCP), frontend/ (React + Vite), and docs/.",
          pt: "Um monorepo com backend/ (agente FastAPI + LangGraph, RAG, MCP), frontend/ (React + Vite) e docs/.",
        },
        why: {
          en: "Keeping backend and frontend in one repo with clear folders makes the system easy to read, build, test and deploy independently — while sharing one event contract.",
          pt: "Manter backend e frontend em um só repositório com pastas claras torna o sistema fácil de ler, construir, testar e implantar de forma independente — compartilhando um único contrato de eventos.",
        },
        where: "repository root · backend/ · frontend/ · docs/",
      },
      {
        id: "tiers",
        title: { en: "Tiered architecture", pt: "Arquitetura em camadas" },
        what: {
          en: "Four tiers: Client (browser), API (gateway), Agent (orchestrator), and AI & Data Services (vector DB, tools, LLM).",
          pt: "Quatro camadas: Cliente (navegador), API (gateway), Agente (orquestrador) e Serviços de IA e Dados (banco vetorial, ferramentas, LLM).",
        },
        why: {
          en: "Separating tiers gives you independent scaling, clear security boundaries (only the API is public), and the freedom to change one layer without touching the others.",
          pt: "Separar as camadas dá escalabilidade independente, fronteiras de segurança claras (só a API é pública) e a liberdade de alterar uma camada sem mexer nas outras.",
        },
        where: "frontend/src/lib/stations.ts (TIERS)",
      },
      {
        id: "client-tier",
        title: { en: "Client tier", pt: "Camada cliente" },
        what: {
          en: "A React single-page app running entirely in the user's browser, served as static files.",
          pt: "Um app React de página única rodando inteiramente no navegador do usuário, servido como arquivos estáticos.",
        },
        why: {
          en: "Static assets are cheap to host on a CDN and infinitely scalable; the heavy lifting (state, animation) happens on the user's device, not your servers.",
          pt: "Arquivos estáticos são baratos de hospedar em CDN e escalam infinitamente; o trabalho pesado (estado, animação) acontece no dispositivo do usuário, não nos seus servidores.",
        },
        where: "frontend/ · served by nginx in Docker",
      },
      {
        id: "api-tier",
        title: { en: "API tier (gateway)", pt: "Camada de API (gateway)" },
        what: {
          en: "A FastAPI service: the single public entrypoint. It terminates TLS, validates input, runs the agent, and streams events back.",
          pt: "Um serviço FastAPI: o único ponto de entrada público. Ele encerra o TLS, valida a entrada, executa o agente e transmite os eventos de volta.",
        },
        why: {
          en: "A gateway centralizes cross-cutting concerns (auth, CORS, rate limits, TLS) and is the only component exposed to the internet.",
          pt: "Um gateway centraliza preocupações transversais (autenticação, CORS, limites de taxa, TLS) e é o único componente exposto à internet.",
        },
        where: "backend/app/main.py",
      },
      {
        id: "agent-tier",
        title: { en: "Agent tier", pt: "Camada do agente" },
        what: {
          en: "The LangGraph agent runtime, on a private network — not reachable from the internet.",
          pt: "O runtime do agente LangGraph, em rede privada — inacessível pela internet.",
        },
        why: {
          en: "Isolating the agent protects model API keys and tools behind the API, and lets you scale the (CPU/latency-heavy) AI logic separately from the web layer.",
          pt: "Isolar o agente protege as chaves de API do modelo e as ferramentas atrás da API, e permite escalar a lógica de IA (pesada em CPU/latência) separadamente da camada web.",
        },
        where: "backend/app/agent/",
      },
      {
        id: "services-tier",
        title: { en: "AI & data services", pt: "Serviços de IA e dados" },
        what: {
          en: "Stateful or managed dependencies: the vector database, the MCP tool server, and the LLM endpoint.",
          pt: "Dependências com estado ou gerenciadas: o banco vetorial, o servidor de ferramentas MCP e o endpoint do LLM.",
        },
        why: {
          en: "Stateless app tiers stay simple and disposable; state and external capabilities live in dedicated services you can manage and back up independently.",
          pt: "Camadas de aplicação sem estado ficam simples e descartáveis; o estado e as capacidades externas vivem em serviços dedicados que você gerencia e faz backup de forma independente.",
        },
        where: "backend/app/rag/ · backend/app/mcp/ · backend/app/llm/",
      },
    ],
  },
  {
    id: "software",
    title: { en: "Software Engineering", pt: "Engenharia de Software" },
    icon: "🧩",
    accent: "#a78bfa",
    intro: {
      en: "The patterns that keep the system clean: an event contract, swappable providers, an explicit state machine, type safety, tests and containers.",
      pt: "Os padrões que mantêm o sistema limpo: um contrato de eventos, provedores intercambiáveis, uma máquina de estados explícita, segurança de tipos, testes e containers.",
    },
    topics: [
      {
        id: "event-driven",
        title: { en: "Event-driven streaming", pt: "Streaming orientado a eventos" },
        what: {
          en: "Every stage emits a TraceEvent; the backend streams them to the browser over Server-Sent Events (SSE).",
          pt: "Cada etapa emite um TraceEvent; o backend os transmite ao navegador via Server-Sent Events (SSE).",
        },
        why: {
          en: "Events decouple the pipeline (producer) from the UI (consumer), enable real-time visualization, and let the same log drive live view and replay.",
          pt: "Eventos desacoplam o pipeline (produtor) da UI (consumidor), permitem visualização em tempo real e deixam o mesmo log alimentar a visão ao vivo e o replay.",
        },
        where: "backend/app/trace.py · backend/app/main.py",
      },
      {
        id: "contract",
        title: { en: "Shared event contract", pt: "Contrato de eventos compartilhado" },
        what: {
          en: "The event schema is defined once with Pydantic and mirrored as TypeScript types.",
          pt: "O schema de eventos é definido uma vez com Pydantic e espelhado como tipos TypeScript.",
        },
        why: {
          en: "A single source of truth for the backend↔frontend protocol eliminates a whole class of integration bugs and makes the wire format self-documenting.",
          pt: "Uma única fonte de verdade para o protocolo backend↔frontend elimina uma classe inteira de bugs de integração e torna o formato de transmissão autodocumentado.",
        },
        where: "backend/app/schemas.py ↔ frontend/src/types/events.ts",
      },
      {
        id: "provider-pattern",
        title: { en: "Provider pattern (Strategy)", pt: "Padrão Provider (Strategy)" },
        what: {
          en: "An LLMProvider interface with two implementations: real OpenAI and a deterministic mock.",
          pt: "Uma interface LLMProvider com duas implementações: OpenAI real e um mock determinístico.",
        },
        why: {
          en: "The Strategy pattern lets the agent stay identical while you swap the model out — that's what makes the app run offline with zero keys.",
          pt: "O padrão Strategy mantém o agente idêntico enquanto você troca o modelo — é isso que faz o app rodar offline sem nenhuma chave.",
        },
        where: "backend/app/llm/provider.py",
      },
      {
        id: "state-machine",
        title: { en: "State machine orchestration", pt: "Orquestração por máquina de estados" },
        what: {
          en: "The agent is a LangGraph StateGraph with explicit nodes and edges, not ad-hoc control flow.",
          pt: "O agente é um StateGraph do LangGraph com nós e arestas explícitos, não um fluxo de controle improvisado.",
        },
        why: {
          en: "Modeling the loop as a graph makes it legible, testable, and easy to extend (add memory, retries, human-in-the-loop) without spaghetti.",
          pt: "Modelar o loop como um grafo o torna legível, testável e fácil de estender (memória, retentativas, humano no loop) sem virar espaguete.",
        },
        where: "backend/app/agent/graph.py",
      },
      {
        id: "type-safety",
        title: { en: "End-to-end type safety", pt: "Segurança de tipos ponta a ponta" },
        what: {
          en: "Pydantic models on the backend, strict TypeScript on the frontend.",
          pt: "Modelos Pydantic no backend, TypeScript estrito no frontend.",
        },
        why: {
          en: "Types catch mistakes at the boundaries (request bodies, event payloads) before runtime and serve as living documentation.",
          pt: "Tipos pegam erros nas fronteiras (corpos de requisição, payloads de eventos) antes da execução e servem como documentação viva.",
        },
        where: "pydantic models · tsconfig strict mode",
      },
      {
        id: "testing-demo",
        title: { en: "Deterministic tests & demo mode", pt: "Testes determinísticos e modo demo" },
        what: {
          en: "A mock provider + mock embeddings let the whole pipeline run offline; pytest covers the protocol, RAG, MCP and the agent.",
          pt: "Um provider mock + embeddings mock fazem todo o pipeline rodar offline; o pytest cobre o protocolo, o RAG, o MCP e o agente.",
        },
        why: {
          en: "CI runs with no API keys and no network — fast, free and reproducible. Demo mode is also what lets anyone clone and run instantly.",
          pt: "O CI roda sem chaves de API e sem rede — rápido, gratuito e reproduzível. O modo demo também é o que permite a qualquer um clonar e rodar na hora.",
        },
        where: "backend/tests/ · backend/app/llm/mock_provider.py",
      },
      {
        id: "config",
        title: { en: "12-factor configuration", pt: "Configuração 12-factor" },
        what: {
          en: "Config comes from environment variables / .env via pydantic-settings; nothing is hardcoded.",
          pt: "A configuração vem de variáveis de ambiente / .env via pydantic-settings; nada fica codificado no código.",
        },
        why: {
          en: "The same container image runs in every environment; secrets are injected at runtime, never committed. Mode auto-detects from the presence of a key.",
          pt: "A mesma imagem de container roda em todos os ambientes; segredos são injetados em tempo de execução, nunca comitados. O modo é detectado automaticamente pela presença de uma chave.",
        },
        where: "backend/app/config.py · .env.example",
      },
      {
        id: "containers",
        title: { en: "Containerization", pt: "Containerização" },
        what: {
          en: "Each service has a Dockerfile; docker-compose runs the whole stack with one command.",
          pt: "Cada serviço tem um Dockerfile; o docker-compose sobe toda a stack com um único comando.",
        },
        why: {
          en: "Containers give reproducible builds and dev/prod parity, and are the unit of deployment for the tiers above.",
          pt: "Containers garantem builds reproduzíveis e paridade dev/prod, e são a unidade de implantação das camadas acima.",
        },
        where: "backend/Dockerfile · frontend/Dockerfile · docker-compose.yml",
      },
    ],
  },
  {
    id: "genai",
    title: { en: "Gen AI Concepts", pt: "Conceitos de Gen AI" },
    icon: "🤖",
    accent: "#f472b6",
    intro: {
      en: "The AI building blocks: tokens, embeddings, retrieval, agents, tools and streaming — and why each one is used here.",
      pt: "Os blocos de construção da IA: tokens, embeddings, recuperação, agentes, ferramentas e streaming — e por que cada um é usado aqui.",
    },
    topics: [
      {
        id: "tokens",
        title: { en: "Tokens & LLMs", pt: "Tokens e LLMs" },
        what: {
          en: "An LLM predicts the next token; both prompt and answer are measured in tokens, which drives cost and latency.",
          pt: "Um LLM prevê o próximo token; tanto o prompt quanto a resposta são medidos em tokens, o que determina custo e latência.",
        },
        why: {
          en: "Understanding tokens explains why context is budgeted and why longer answers take longer — the model does one forward pass per token.",
          pt: "Entender tokens explica por que o contexto é orçado e por que respostas mais longas demoram mais — o modelo faz um forward pass por token.",
        },
        where: "knowledge corpus: llm-basics.md",
      },
      {
        id: "embeddings",
        title: { en: "Embeddings", pt: "Embeddings" },
        what: {
          en: "A vector that captures the meaning of text; similar meanings map to nearby vectors.",
          pt: "Um vetor que captura o significado de um texto; significados parecidos mapeiam para vetores próximos.",
        },
        why: {
          en: "Embeddings power semantic search — finding relevant text even when it shares no exact words with the query.",
          pt: "Embeddings alimentam a busca semântica — encontrar texto relevante mesmo quando ele não compartilha palavras exatas com a consulta.",
        },
        where: "backend/app/rag/embeddings.py",
      },
      {
        id: "vector-search",
        title: { en: "Vector search & cosine", pt: "Busca vetorial e cosseno" },
        what: {
          en: "Comparing the query vector to stored vectors with cosine similarity to find the closest matches.",
          pt: "Comparar o vetor da consulta com os vetores armazenados usando similaridade de cosseno para achar as correspondências mais próximas.",
        },
        why: {
          en: "Cosine ignores magnitude and captures direction (meaning), which is the standard, robust metric for text retrieval.",
          pt: "O cosseno ignora a magnitude e captura a direção (o significado), que é a métrica padrão e robusta para recuperação de texto.",
        },
        where: "backend/app/rag/retriever.py",
      },
      {
        id: "rag",
        title: { en: "Retrieval-Augmented Generation", pt: "Geração Aumentada por Recuperação (RAG)" },
        what: {
          en: "Retrieve relevant chunks at query time and put them in the prompt as grounding context.",
          pt: "Recuperar trechos relevantes no momento da consulta e colocá-los no prompt como contexto de fundamentação.",
        },
        why: {
          en: "RAG lets the model answer about private or recent data it never trained on, and reduces hallucinations by grounding answers in real sources.",
          pt: "O RAG permite ao modelo responder sobre dados privados ou recentes nos quais ele nunca treinou, e reduz alucinações ao fundamentar as respostas em fontes reais.",
        },
        where: "backend/app/rag/",
      },
      {
        id: "chunking",
        title: { en: "Chunking", pt: "Chunking (fatiamento)" },
        what: {
          en: "Splitting documents into overlapping pieces before embedding them.",
          pt: "Dividir documentos em pedaços sobrepostos antes de gerar seus embeddings.",
        },
        why: {
          en: "Chunk size trades off relevance vs. context: too big dilutes, too small loses meaning. Overlap keeps ideas from being cut in half.",
          pt: "O tamanho do chunk equilibra relevância vs. contexto: grande demais dilui, pequeno demais perde sentido. A sobreposição evita que ideias sejam cortadas ao meio.",
        },
        where: "backend/app/rag/ingest.py",
      },
      {
        id: "agents-react",
        title: { en: "Agents & the ReAct loop", pt: "Agentes e o loop ReAct" },
        what: {
          en: "An LLM in a loop that can reason, call a tool, observe the result, and decide again — with a step limit.",
          pt: "Um LLM em loop que pode raciocinar, chamar uma ferramenta, observar o resultado e decidir de novo — com um limite de passos.",
        },
        why: {
          en: "Looping lets the agent gather information before answering; the bounded limit prevents runaway cost and latency.",
          pt: "O loop permite ao agente reunir informação antes de responder; o limite definido evita custo e latência descontrolados.",
        },
        where: "backend/app/agent/graph.py",
      },
      {
        id: "tool-calling",
        title: { en: "Tool calling & MCP", pt: "Chamada de ferramentas e MCP" },
        what: {
          en: "The model chooses a tool and arguments; tools are exposed via the Model Context Protocol (MCP).",
          pt: "O modelo escolhe uma ferramenta e seus argumentos; as ferramentas são expostas pelo Model Context Protocol (MCP).",
        },
        why: {
          en: "Tools give the model real capabilities (math, time, lookups). MCP standardizes how apps connect to tools so they're reusable and swappable.",
          pt: "Ferramentas dão ao modelo capacidades reais (matemática, hora, consultas). O MCP padroniza como apps se conectam a ferramentas para que sejam reutilizáveis e intercambiáveis.",
        },
        where: "backend/app/mcp/",
      },
      {
        id: "prompt",
        title: { en: "Prompt / context engineering", pt: "Engenharia de prompt / contexto" },
        what: {
          en: "Assembling the system prompt + retrieved context + tool results into the final input.",
          pt: "Montar o prompt de sistema + contexto recuperado + resultados de ferramentas na entrada final.",
        },
        why: {
          en: "What you send shapes the output. Inspecting the assembled prompt is one of the most useful debugging skills in AI engineering.",
          pt: "O que você envia molda a saída. Inspecionar o prompt montado é uma das habilidades de depuração mais úteis em engenharia de IA.",
        },
        where: "backend/app/agent/prompts.py · llm providers",
      },
      {
        id: "streaming",
        title: { en: "Streaming generation", pt: "Geração com streaming" },
        what: {
          en: "The model emits the answer one token at a time, streamed to the UI as it's produced.",
          pt: "O modelo emite a resposta um token por vez, transmitida à UI conforme é produzida.",
        },
        why: {
          en: "Streaming makes responses feel instant and lets the user start reading before generation finishes.",
          pt: "O streaming faz as respostas parecerem instantâneas e deixa o usuário começar a ler antes de a geração terminar.",
        },
        where: "stream_answer() in llm providers → SSE",
      },
    ],
  },
  {
    id: "security",
    title: { en: "Security per Layer", pt: "Segurança por Camada" },
    icon: "🛡️",
    accent: "#34d399",
    intro: {
      en: "Security is layered: encryption in transit, private boundaries, validated input, managed secrets and safe tool execution.",
      pt: "A segurança é em camadas: criptografia em trânsito, fronteiras privadas, entrada validada, segredos gerenciados e execução segura de ferramentas.",
    },
    topics: [
      {
        id: "tls",
        title: { en: "TLS / HTTPS at the edge", pt: "TLS / HTTPS na borda" },
        what: {
          en: "The browser↔API connection is encrypted with HTTPS (TLS 1.3), terminated at the ingress.",
          pt: "A conexão navegador↔API é criptografada com HTTPS (TLS 1.3), encerrada no ingress.",
        },
        why: {
          en: "TLS protects the message and the streamed answer from eavesdropping and tampering on the public internet.",
          pt: "O TLS protege a mensagem e a resposta transmitida contra espionagem e adulteração na internet pública.",
        },
        where: "Client ↔ API hop",
      },
      {
        id: "private-net",
        title: { en: "Private network & mTLS", pt: "Rede privada e mTLS" },
        what: {
          en: "API↔Agent traffic stays on a private, in-cluster network, optionally with mutual TLS.",
          pt: "O tráfego API↔Agente fica em uma rede privada dentro do cluster, opcionalmente com TLS mútuo.",
        },
        why: {
          en: "Internal services should never be internet-exposed; keeping them private shrinks the attack surface to the single API gateway.",
          pt: "Serviços internos nunca devem ficar expostos à internet; mantê-los privados reduz a superfície de ataque ao único gateway de API.",
        },
        where: "API ↔ Agent hop",
      },
      {
        id: "cors",
        title: { en: "CORS", pt: "CORS" },
        what: {
          en: "The API only accepts browser requests from configured origins.",
          pt: "A API só aceita requisições de navegador vindas de origens configuradas.",
        },
        why: {
          en: "Cross-Origin Resource Sharing rules prevent arbitrary websites from calling your API on a user's behalf.",
          pt: "As regras de Cross-Origin Resource Sharing impedem que sites arbitrários chamem sua API em nome de um usuário.",
        },
        where: "CORSMiddleware in backend/app/main.py",
      },
      {
        id: "secrets",
        title: { en: "Secrets management", pt: "Gerenciamento de segredos" },
        what: {
          en: "API keys come from environment variables; .env is git-ignored and never committed.",
          pt: "As chaves de API vêm de variáveis de ambiente; o .env é ignorado pelo git e nunca comitado.",
        },
        why: {
          en: "Hardcoded secrets leak through source control. Injecting them at runtime keeps them out of the image and the repo.",
          pt: "Segredos no código vazam pelo controle de versão. Injetá-los em tempo de execução os mantém fora da imagem e do repositório.",
        },
        where: "backend/app/config.py · .gitignore",
      },
      {
        id: "validation",
        title: { en: "Input validation", pt: "Validação de entrada" },
        what: {
          en: "Incoming requests are validated and bounded by Pydantic models (e.g. message length).",
          pt: "As requisições recebidas são validadas e limitadas por modelos Pydantic (ex.: tamanho da mensagem).",
        },
        why: {
          en: "Validating at the boundary rejects malformed or oversized input early, before it reaches the agent.",
          pt: "Validar na fronteira rejeita entradas malformadas ou grandes demais cedo, antes de chegarem ao agente.",
        },
        where: "ChatRequest in backend/app/schemas.py",
      },
      {
        id: "safe-tools",
        title: { en: "Safe tool execution", pt: "Execução segura de ferramentas" },
        what: {
          en: "The calculator tool parses an AST and evaluates only arithmetic — it never calls eval().",
          pt: "A ferramenta de calculadora analisa uma AST e avalia apenas aritmética — nunca chama eval().",
        },
        why: {
          en: "Running model-chosen input through eval() is a remote-code-execution risk; a whitelisted AST evaluator is safe by construction.",
          pt: "Rodar via eval() uma entrada escolhida pelo modelo é um risco de execução remota de código; um avaliador de AST com lista de permissões é seguro por construção.",
        },
        where: "backend/app/mcp/server.py",
      },
    ],
  },
  {
    id: "infra",
    title: { en: "Networking & Infrastructure", pt: "Rede e Infraestrutura" },
    icon: "🌐",
    accent: "#fbbf24",
    intro: {
      en: "How the pieces talk and run: containers, network hops, long-lived connections, stateless scaling and an example cloud mapping.",
      pt: "Como as peças conversam e rodam: containers, saltos de rede, conexões de longa duração, escalabilidade sem estado e um exemplo de mapeamento em nuvem.",
    },
    topics: [
      {
        id: "hops",
        title: { en: "Network hops", pt: "Saltos de rede" },
        what: {
          en: "Each arrow between tiers is a real network call with its own protocol (HTTPS, in-cluster HTTP, TCP, MCP/stdio).",
          pt: "Cada seta entre camadas é uma chamada de rede real com seu próprio protocolo (HTTPS, HTTP dentro do cluster, TCP, MCP/stdio).",
        },
        why: {
          en: "Seeing the hops makes the real cost and complexity of a distributed app visible — every boundary adds latency and a failure point.",
          pt: "Ver os saltos torna visível o custo e a complexidade reais de um app distribuído — cada fronteira adiciona latência e um ponto de falha.",
        },
        where: "frontend/src/lib/stations.ts (HOPS)",
      },
      {
        id: "ingress",
        title: { en: "Ingress & egress", pt: "Ingress e egress" },
        what: {
          en: "Ingress is inbound traffic to the API; egress is the agent's outbound calls (to the LLM, tools).",
          pt: "Ingress é o tráfego de entrada para a API; egress são as chamadas de saída do agente (para o LLM, ferramentas).",
        },
        why: {
          en: "Controlling ingress/egress is how you firewall a system: only the API takes ingress; only the agent makes egress to model providers.",
          pt: "Controlar ingress/egress é como você protege um sistema com firewall: só a API recebe ingress; só o agente faz egress para provedores de modelos.",
        },
        where: "API tier (ingress) · Agent tier (egress)",
      },
      {
        id: "sse-http",
        title: { en: "SSE over HTTP", pt: "SSE sobre HTTP" },
        what: {
          en: "Server-Sent Events stream many messages over a single long-lived HTTP response.",
          pt: "Server-Sent Events transmitem várias mensagens por uma única resposta HTTP de longa duração.",
        },
        why: {
          en: "SSE is simpler than WebSockets for one-way server→client streaming and rides over ordinary HTTP/HTTPS infrastructure.",
          pt: "SSE é mais simples que WebSockets para streaming unidirecional servidor→cliente e funciona sobre a infraestrutura HTTP/HTTPS comum.",
        },
        where: "EventSourceResponse · frontend/src/lib/sse.ts",
      },
      {
        id: "stateless-scaling",
        title: { en: "Stateless services & scaling", pt: "Serviços sem estado e escalabilidade" },
        what: {
          en: "The API and agent hold no per-user state between requests, so you can run many replicas behind a load balancer.",
          pt: "A API e o agente não guardam estado por usuário entre requisições, então você pode rodar muitas réplicas atrás de um balanceador de carga.",
        },
        why: {
          en: "Statelessness is what makes horizontal scaling (and zero-downtime deploys) possible; state is pushed to the data tier.",
          pt: "A ausência de estado é o que torna possível a escalabilidade horizontal (e deploys sem downtime); o estado é empurrado para a camada de dados.",
        },
        where: "API & Agent tiers",
      },
      {
        id: "reverse-proxy",
        title: { en: "Reverse proxy", pt: "Proxy reverso" },
        what: {
          en: "In production the React build is served by nginx, which also handles SPA routing.",
          pt: "Em produção, o build do React é servido pelo nginx, que também cuida do roteamento da SPA.",
        },
        why: {
          en: "A small static web server is fast, cache-friendly and the standard way to ship a front-end build.",
          pt: "Um pequeno servidor web estático é rápido, amigável a cache e a forma padrão de entregar um build de front-end.",
        },
        where: "frontend/nginx.conf · frontend/Dockerfile",
      },
      {
        id: "azure",
        title: { en: "Cloud mapping (Azure example)", pt: "Mapeamento em nuvem (exemplo Azure)" },
        what: {
          en: "Client → Static Web Apps + Front Door; API & Agent → Container Apps; vector DB → AI Search / Chroma; LLM → Azure OpenAI.",
          pt: "Cliente → Static Web Apps + Front Door; API e Agente → Container Apps; banco vetorial → AI Search / Chroma; LLM → Azure OpenAI.",
        },
        why: {
          en: "The tier model is cloud-agnostic; this is one concrete mapping showing how each container becomes a managed service.",
          pt: "O modelo de camadas é agnóstico de nuvem; este é um mapeamento concreto mostrando como cada container vira um serviço gerenciado.",
        },
        where: "frontend/src/lib/stations.ts (azure fields)",
      },
    ],
  },
  {
    id: "data",
    title: { en: "Data & Databases", pt: "Dados e Bancos de Dados" },
    icon: "🗄️",
    accent: "#2dd4bf",
    intro: {
      en: "Where data lives: the vector database for retrieval, persistence, and the application database the backend would connect to.",
      pt: "Onde os dados ficam: o banco vetorial para recuperação, a persistência e o banco de aplicação ao qual o backend se conectaria.",
    },
    topics: [
      {
        id: "vector-db",
        title: { en: "Vector database (Chroma)", pt: "Banco de dados vetorial (Chroma)" },
        what: {
          en: "Chroma stores chunk embeddings + text + metadata and serves nearest-neighbor search.",
          pt: "O Chroma armazena embeddings dos trechos + texto + metadados e serve a busca por vizinhos mais próximos.",
        },
        why: {
          en: "A purpose-built vector store makes semantic retrieval fast and is the storage half of the RAG pipeline.",
          pt: "Um armazenamento vetorial dedicado torna a recuperação semântica rápida e é a metade de armazenamento do pipeline de RAG.",
        },
        where: "backend/app/rag/store.py",
      },
      {
        id: "ann-index",
        title: { en: "ANN index (HNSW)", pt: "Índice ANN (HNSW)" },
        what: {
          en: "An approximate nearest-neighbor index (HNSW) finds close vectors without scanning every record.",
          pt: "Um índice de vizinhos mais próximos aproximados (HNSW) encontra vetores próximos sem varrer cada registro.",
        },
        why: {
          en: "Brute-force comparison doesn't scale; an index keeps retrieval fast as the corpus grows to millions of chunks.",
          pt: "A comparação por força bruta não escala; um índice mantém a recuperação rápida conforme o corpus cresce para milhões de trechos.",
        },
        where: "Chroma collection (hnsw:space = cosine)",
      },
      {
        id: "persistence",
        title: { en: "Persistence & volumes", pt: "Persistência e volumes" },
        what: {
          en: "The Chroma index is persisted to disk and mounted as a Docker volume, surviving restarts.",
          pt: "O índice do Chroma é persistido em disco e montado como volume do Docker, sobrevivendo a reinicializações.",
        },
        why: {
          en: "Re-embedding on every boot is slow and (with a real model) costly; persisting the index reuses it across restarts.",
          pt: "Recalcular os embeddings a cada inicialização é lento e (com um modelo real) caro; persistir o índice o reaproveita entre reinicializações.",
        },
        where: "docker-compose.yml (chroma-data volume)",
      },
      {
        id: "app-db",
        title: { en: "Application database", pt: "Banco de dados da aplicação" },
        what: {
          en: "A relational/document DB the backend connects to for users, chat history and sessions. This demo keeps traces in an in-memory store; a real deployment would use Postgres, Azure SQL or Cosmos DB.",
          pt: "Um banco relacional/documental ao qual o backend se conecta para usuários, histórico de chat e sessões. Esta demo mantém os traces em um armazenamento em memória; uma implantação real usaria Postgres, Azure SQL ou Cosmos DB.",
        },
        why: {
          en: "Conversations, accounts and audit logs must outlive a process and be shared across replicas — that's exactly what a managed database provides.",
          pt: "Conversas, contas e logs de auditoria precisam sobreviver a um processo e ser compartilhados entre réplicas — é exatamente o que um banco gerenciado oferece.",
        },
        where: "backend/app/trace.py (TraceStore — in-memory today)",
      },
      {
        id: "in-memory",
        title: { en: "In-memory state & trade-offs", pt: "Estado em memória e trade-offs" },
        what: {
          en: "Traces live in a bounded in-memory dict, so they're lost on restart and not shared between replicas.",
          pt: "Os traces vivem em um dicionário em memória limitado, então são perdidos na reinicialização e não são compartilhados entre réplicas.",
        },
        why: {
          en: "In-memory is perfect for a single-instance demo (zero setup), but it's the first thing you'd replace with a database to scale out.",
          pt: "Em memória é perfeito para uma demo de instância única (zero configuração), mas é a primeira coisa que você trocaria por um banco de dados para escalar horizontalmente.",
        },
        where: "TraceStore in backend/app/trace.py",
      },
    ],
  },
];

// --- Resolvers + per-language caches -----------------------------------------

function resolveTopic(t: TopicSrc, lang: Lang): Topic {
  return { ...t, title: r(t.title, lang), what: r(t.what, lang), why: r(t.why, lang) };
}

function resolveSection(s: SectionSrc, lang: Lang): Section {
  return {
    ...s,
    title: r(s.title, lang),
    intro: r(s.intro, lang),
    topics: s.topics.map((t) => resolveTopic(t, lang)),
  };
}

const sectionsCache: Partial<Record<Lang, Section[]>> = {};
const allTopicsCache: Partial<Record<Lang, Record<string, { topic: Topic; section: Section }>>> = {};

export function sectionsFor(lang: Lang): Section[] {
  return (sectionsCache[lang] ??= SECTIONS_SRC.map((s) => resolveSection(s, lang)));
}

export function allTopicsFor(lang: Lang): Record<string, { topic: Topic; section: Section }> {
  return (allTopicsCache[lang] ??= sectionsFor(lang).reduce(
    (acc, section) => {
      for (const topic of section.topics) acc[topic.id] = { topic, section };
      return acc;
    },
    {} as Record<string, { topic: Topic; section: Section }>,
  ));
}
