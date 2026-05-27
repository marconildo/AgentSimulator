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
    accent: "var(--color-sky)",
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
          en: "Four tiers, each with its classic n-tier name: Client (Presentation), API (Application), Agent (Compute/worker), and AI & Data Services (Data) — which holds the LLM, the vector DB and the application database.",
          pt: "Quatro camadas, cada uma com seu nome clássico de n-tier: Cliente (Apresentação), API (Aplicação), Agente (Compute/worker) e Serviços de IA e Dados (Dados) — que abriga o LLM, o vector DB e o banco de dados da aplicação.",
        },
        why: {
          en: "Separating tiers gives independent scaling and clear security boundaries: only the Client is on the public internet, everything else sits inside a private network (VNet / VPC). The friendly names stay aligned with the market-standard n-tier model.",
          pt: "Separar as camadas dá escalabilidade independente e fronteiras de segurança claras: só o Cliente fica na internet pública, todo o resto vive dentro de uma rede privada (VNet / VPC). Os nomes amigáveis ficam alinhados ao modelo n-tier padrão de mercado.",
        },
        where: "frontend/src/lib/stations.ts (TIERS_SRC · alias)",
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
          en: "Stateful or managed dependencies: the application database (relational), the vector database (RAG), the MCP tool server, and the LLM endpoint.",
          pt: "Dependências com estado ou gerenciadas: o banco de dados da aplicação (relacional), o banco vetorial (RAG), o servidor de ferramentas MCP e o endpoint do LLM.",
        },
        why: {
          en: "Stateless app tiers stay simple and disposable; state and external capabilities live in dedicated services you manage and back up independently. Note the two databases: a relational one for app state, a vector one for retrieval — different jobs, different stores.",
          pt: "Camadas de aplicação sem estado ficam simples e descartáveis; o estado e as capacidades externas vivem em serviços dedicados que você gerencia e faz backup de forma independente. Repare nos dois bancos: um relacional para o estado da app, um vetorial para a recuperação — trabalhos diferentes, armazenamentos diferentes.",
        },
        where: "backend/app/db/ · backend/app/rag/ · backend/app/mcp/ · backend/app/llm/",
      },
    ],
  },
  {
    id: "software",
    title: { en: "Software Engineering", pt: "Engenharia de Software" },
    icon: "🧩",
    accent: "var(--color-violet)",
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
          en: "An LLMProvider interface with one implementation today (OpenAI); the seam keeps the agent decoupled from any single model SDK.",
          pt: "Uma interface LLMProvider com uma implementação hoje (OpenAI); a costura mantém o agente desacoplado de qualquer SDK de modelo específico.",
        },
        why: {
          en: "The Strategy pattern lets the agent stay identical while the model behind it changes — so swapping models (or adding Azure OpenAI / Bedrock / Vertex later) never touches the agent loop.",
          pt: "O padrão Strategy mantém o agente idêntico enquanto o modelo por trás muda — então trocar de modelo (ou adicionar Azure OpenAI / Bedrock / Vertex depois) nunca mexe no loop do agente.",
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
        title: { en: "Structural tests", pt: "Testes estruturais" },
        what: {
          en: "pytest covers the protocol, RAG, MCP and the agent against real OpenAI; assertions are structural (stages fired, tool used, answer non-empty, relevant doc ranks first) so they tolerate model variability.",
          pt: "O pytest cobre o protocolo, o RAG, o MCP e o agente contra a OpenAI real; as asserções são estruturais (etapas disparadas, ferramenta usada, resposta não vazia, doc relevante em primeiro) para tolerar a variabilidade do modelo.",
        },
        why: {
          en: "The app is OpenAI-only — there is no mock to fall back on, so tests exercise the real provider (CI supplies the key as a secret). Structural assertions keep them stable despite nondeterministic generations.",
          pt: "O app é exclusivamente OpenAI — não há mock para usar como fallback, então os testes exercitam o provider real (o CI fornece a chave como secret). As asserções estruturais os mantêm estáveis apesar das gerações não determinísticas.",
        },
        where: "backend/tests/",
      },
      {
        id: "config",
        title: { en: "12-factor configuration", pt: "Configuração 12-factor" },
        what: {
          en: "Config comes from environment variables / .env via pydantic-settings; nothing is hardcoded.",
          pt: "A configuração vem de variáveis de ambiente / .env via pydantic-settings; nada fica codificado no código.",
        },
        why: {
          en: "The same container image runs in every environment; secrets are injected at runtime, never committed. OPENAI_API_KEY is required — with no key the app fails fast at startup.",
          pt: "A mesma imagem de container roda em todos os ambientes; segredos são injetados em tempo de execução, nunca comitados. A OPENAI_API_KEY é obrigatória — sem chave, o app falha rápido na inicialização.",
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
    accent: "var(--color-pink)",
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
        id: "agent-memory",
        title: { en: "Agent memory (working vs long-term)", pt: "Memória do agente (trabalho vs longo prazo)" },
        what: {
          en: "Working memory is the current request's state (messages + the tool scratchpad of act→observe steps); long-term memory survives across requests — here the conversation history in the app database, plus the RAG vector store as semantic memory.",
          pt: "A memória de trabalho é o estado da requisição atual (mensagens + o rascunho de ferramentas dos passos agir→observar); a memória de longo prazo sobrevive entre requisições — aqui o histórico de conversas no banco da aplicação, mais o vector store do RAG como memória semântica.",
        },
        why: {
          en: "Telling the two apart is core to agent design: working memory is cheap and ephemeral, long-term memory must be stored and retrieved. The history is folded into the real prompt — open the Agent's full view to see both.",
          pt: "Distinguir as duas é central no design de agentes: a de trabalho é barata e efêmera, a de longo prazo precisa ser armazenada e recuperada. O histórico entra no prompt de verdade — abra a visão completa do Agente para ver as duas.",
        },
        where: "backend/app/db/store.py · run_agent(history=…) · AgentDetail.tsx",
      },
      {
        id: "context-window",
        title: { en: "Context window assembly", pt: "Montagem da janela de contexto" },
        what: {
          en: "The single input the model actually receives: system prompt + retrieved context (RAG) + tool results + conversation history, each costing tokens within a finite budget.",
          pt: "A única entrada que o modelo de fato recebe: prompt de sistema + contexto recuperado (RAG) + resultados de ferramentas + histórico de conversa, cada parte custando tokens dentro de um orçamento finito.",
        },
        why: {
          en: "The context window is finite, so what you include (and leave out) is a real engineering decision; the Agent's full view shows the breakdown and an approximate token share per part.",
          pt: "A janela de contexto é finita, então o que você inclui (e deixa de fora) é uma decisão real de engenharia; a visão completa do Agente mostra a composição e a fração aproximada de tokens de cada parte.",
        },
        where: "AgentDetail.tsx (context window) · llm prompt_preview",
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
    accent: "var(--color-ok)",
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
        title: { en: "Private network (VNet / VPC) & mTLS", pt: "Rede privada (VNet / VPC) e mTLS" },
        what: {
          en: "Every tier except the Client lives inside a private network boundary (Azure VNet / AWS VPC / GCP VPC). Internal traffic (API↔Agent, Agent↔services) stays in-cluster, with mTLS and per-hop network rules (NSG / Security Group).",
          pt: "Toda camada exceto o Cliente vive dentro de uma fronteira de rede privada (Azure VNet / AWS VPC / GCP VPC). O tráfego interno (API↔Agente, Agente↔serviços) fica no cluster, com mTLS e regras de rede por hop (NSG / Security Group).",
        },
        why: {
          en: "Internal services should never be internet-exposed; the private boundary shrinks the attack surface to the single public ingress and is drawn explicitly on the canvas.",
          pt: "Serviços internos nunca devem ficar expostos à internet; a fronteira privada reduz a superfície de ataque ao único ingress público e é desenhada explicitamente no canvas.",
        },
        where: "frontend/src/lib/stations.ts (BOUNDARY_SRC) · private hops",
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
    accent: "var(--color-warn)",
    intro: {
      en: "How the pieces talk and run: containers, network hops, the private-network boundary, firewalls and private endpoints, long-lived connections, stateless scaling, and how the agnostic model maps onto Azure, AWS or GCP.",
      pt: "Como as peças conversam e rodam: containers, saltos de rede, a fronteira de rede privada, firewalls e private endpoints, conexões de longa duração, escalabilidade sem estado, e como o modelo agnóstico mapeia para Azure, AWS ou GCP.",
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
        id: "cloud-mapping",
        title: { en: "Cloud mapping (Azure · AWS · GCP)", pt: "Mapeamento em nuvem (Azure · AWS · GCP)" },
        what: {
          en: "Each agnostic role maps to a managed service per provider — e.g. the API tier → Azure Container Apps / AWS App Runner / Cloud Run; the LLM → Azure OpenAI / Amazon Bedrock / Vertex AI. The header's cloud toggle swaps which names you see.",
          pt: "Cada papel agnóstico mapeia para um serviço gerenciado por provedor — ex.: a camada de API → Azure Container Apps / AWS App Runner / Cloud Run; o LLM → Azure OpenAI / Amazon Bedrock / Vertex AI. O seletor de nuvem no cabeçalho troca quais nomes você vê.",
        },
        why: {
          en: "The tier model is cloud-agnostic by design; keeping the providers as a swappable overlay (instead of forking the app per cloud) teaches portability — the same architecture runs anywhere.",
          pt: "O modelo de camadas é agnóstico por design; manter os provedores como uma camada trocável (em vez de bifurcar o app por nuvem) ensina portabilidade — a mesma arquitetura roda em qualquer lugar.",
        },
        where: "frontend/src/lib/cloud.ts · clouds{} fields in stations.ts",
      },
      {
        id: "vnet",
        title: { en: "Private network boundary (VNet / VPC)", pt: "Fronteira de rede privada (VNet / VPC)" },
        what: {
          en: "A virtual network that wraps the API, Agent and Services tiers; the Client sits outside it, on the public internet. Drawn as the dashed perimeter on the canvas.",
          pt: "Uma rede virtual que envolve as camadas de API, Agente e Serviços; o Cliente fica fora dela, na internet pública. Desenhada como o perímetro tracejado no canvas.",
        },
        why: {
          en: "The boundary is the backbone of network security: nothing inside is reachable from the internet except through the controlled public ingress.",
          pt: "A fronteira é a espinha dorsal da segurança de rede: nada lá dentro é acessível pela internet exceto pelo ingress público controlado.",
        },
        where: "frontend/src/lib/stations.ts (BOUNDARY_SRC)",
      },
      {
        id: "firewall-waf",
        title: { en: "Firewall · WAF · DDoS at the edge", pt: "Firewall · WAF · DDoS na borda" },
        what: {
          en: "The single public hop (Client → API) is fronted by a Web Application Firewall and DDoS protection (Front Door / AWS WAF / Cloud Armor) — shown with a shield on that edge.",
          pt: "O único hop público (Cliente → API) é protegido por um Web Application Firewall e proteção DDoS (Front Door / AWS WAF / Cloud Armor) — mostrado com um escudo nessa aresta.",
        },
        why: {
          en: "Filtering malicious traffic at the edge — before it reaches your code — blocks common web attacks and volumetric floods cheaply.",
          pt: "Filtrar tráfego malicioso na borda — antes de chegar ao seu código — bloqueia ataques web comuns e enxurradas volumétricas de forma barata.",
        },
        where: "public hop · frontend/src/lib/stations.ts (HOPS_SRC zone/controls)",
      },
      {
        id: "private-endpoint",
        title: { en: "Private endpoints to managed services", pt: "Private endpoints para serviços gerenciados" },
        what: {
          en: "Calls from the tiers to managed data/AI services (database, vector store, LLM) travel over private endpoints (Private Endpoint / PrivateLink / Private Service Connect) rather than the public internet.",
          pt: "Chamadas das camadas para serviços gerenciados de dados/IA (banco, vector store, LLM) trafegam por private endpoints (Private Endpoint / PrivateLink / Private Service Connect) em vez da internet pública.",
        },
        why: {
          en: "Private connectivity keeps managed-service traffic off the public internet, so credentials and data never traverse an exposed path.",
          pt: "A conectividade privada mantém o tráfego de serviços gerenciados fora da internet pública, então credenciais e dados nunca passam por um caminho exposto.",
        },
        where: "private hops · HOPS_SRC (controls)",
      },
    ],
  },
  {
    id: "data",
    title: { en: "Data & Databases", pt: "Dados e Bancos de Dados" },
    icon: "🗄️",
    accent: "var(--color-teal)",
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
        title: { en: "Application database (its own station)", pt: "Banco de dados da aplicação (estação própria)" },
        what: {
          en: "A real relational database — a SQLite store here, a managed SQL service (Azure SQL / RDS / Cloud SQL) in production. The backend reads recent history (db.read) and persists every conversation (db.write); you can watch both light up on the canvas.",
          pt: "Um banco relacional real — aqui um SQLite, em produção um serviço SQL gerenciado (Azure SQL / RDS / Cloud SQL). O backend lê o histórico recente (db.read) e persiste cada conversa (db.write); dá para ver os dois acendendo no canvas.",
        },
        why: {
          en: "Conversations, accounts and audit logs must outlive a process and be shared across replicas. It is deliberately separate from the RAG vector store — transactional state and embeddings are different jobs with different databases.",
          pt: "Conversas, contas e logs de auditoria precisam sobreviver a um processo e ser compartilhados entre réplicas. É propositalmente separado do vector store do RAG — estado transacional e embeddings são trabalhos diferentes com bancos diferentes.",
        },
        where: "backend/app/db/store.py (ConversationStore · SQLite)",
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
  {
    id: "production",
    title: { en: "Production & AI-Ops", pt: "Produção e AI-Ops" },
    icon: "🪜",
    accent: "var(--color-orange)",
    intro: {
      en: "What an agent needs to grow up. Climb from Simple → Intermediate → Advanced and these are the production concerns each rung adds — the AI-Ops axis that separates a teaching demo from a real pipeline. (Preview topology: declared as non-executing 'coming soon' nodes; each lands in its own spec.)",
      pt: "O que um agente precisa para amadurecer. Suba de Simples → Intermediário → Avançado e estes são os temas de produção que cada degrau adiciona — o eixo de AI-Ops que separa uma demo didática de um pipeline real. (Topologia de prévia: declarados como nós 'em breve' que não executam; cada um chega em sua própria spec.)",
    },
    topics: [
      {
        id: "deepagents",
        title: { en: "DeepAgents (Intermediate)", pt: "DeepAgents (Intermediário)" },
        what: {
          en: "An evolution of the simple ReAct loop: a planner that writes an explicit task list, sub-agents it can spawn for sub-tasks, and a virtual file system as scratch memory — so the agent can tackle longer, multi-step work without losing the thread.",
          pt: "Uma evolução do loop ReAct simples: um planejador que escreve uma lista explícita de tarefas, subagentes que ele pode criar para subtarefas e um sistema de arquivos virtual como memória de rascunho — para o agente encarar trabalhos mais longos e com vários passos sem perder o fio.",
        },
        why: {
          en: "A flat ReAct loop forgets its plan and burns context on long tasks. DeepAgents adds structure — plan, delegate, persist — so the agent stays coherent over many steps. The Intermediate rung reframes the Agent node as DeepAgents to mark this direction.",
          pt: "Um loop ReAct plano esquece o plano e gasta contexto em tarefas longas. O DeepAgents adiciona estrutura — planejar, delegar, persistir — para o agente se manter coerente ao longo de muitos passos. O degrau Intermediário renomeia o nó do Agente como DeepAgents para marcar essa direção.",
        },
        where: "stations.ts · AGENT_SCENARIO_LABEL (intermediate) — label only, not yet implemented",
      },
      {
        id: "multi-agent",
        title: { en: "Multi-agent orchestration (Advanced)", pt: "Orquestração multi-agente (Avançado)" },
        what: {
          en: "Several specialized agents that coordinate instead of one monolithic loop: an orchestrator (or supervisor) plans and delegates to workers — e.g. a researcher, a coder, a critic — each with its own prompt and tools, then merges their results.",
          pt: "Vários agentes especializados que se coordenam em vez de um único loop monolítico: um orquestrador (ou supervisor) planeja e delega a workers — ex.: um pesquisador, um programador, um crítico — cada um com seu próprio prompt e ferramentas, e então junta os resultados.",
        },
        why: {
          en: "Specialization beats one generalist on complex work: each sub-agent has a focused prompt and toolset, they can run in parallel, and a critic can review before the answer ships. The Advanced rung reframes the Agent as DeepAgents + Multi-agents.",
          pt: "Especialização supera um único generalista em trabalhos complexos: cada subagente tem prompt e ferramentas focados, podem rodar em paralelo e um crítico pode revisar antes de a resposta sair. O degrau Avançado renomeia o Agente como DeepAgents + Multiagentes.",
        },
        where: "stations.ts · AGENT_SCENARIO_LABEL (advanced) — label only, not yet implemented",
      },
      {
        id: "reranker",
        title: { en: "Reranker (cross-encoder)", pt: "Reranker (cross-encoder)" },
        what: {
          en: "A second-pass model that re-scores the top-k chunks the vector search returned, reading the query and each chunk together (a cross-encoder) instead of comparing pre-computed embeddings.",
          pt: "Um modelo de segundo passo que re-pontua os top-k trechos que a busca vetorial retornou, lendo a consulta e cada trecho juntos (um cross-encoder) em vez de comparar embeddings pré-computados.",
        },
        why: {
          en: "Bi-encoder vector search is fast but coarse; a reranker is slower but far more precise, so you retrieve many candidates cheaply and rerank a few accurately — a big lift in RAG quality for little extra latency.",
          pt: "A busca vetorial por bi-encoder é rápida mas grosseira; um reranker é mais lento porém muito mais preciso, então você recupera muitos candidatos de forma barata e reordena poucos com precisão — um grande ganho de qualidade no RAG com pouca latência extra.",
        },
        where: "stations.ts · station 'reranker' (Intermediate preview)",
      },
      {
        id: "hybrid-search",
        title: { en: "Hybrid search (BM25 + dense + RRF)", pt: "Busca híbrida (BM25 + densa + RRF)" },
        what: {
          en: "Runs keyword search (BM25) and semantic vector search side by side, then fuses the two ranked lists — typically with Reciprocal Rank Fusion (RRF) — into one result set.",
          pt: "Roda busca por palavra-chave (BM25) e busca vetorial semântica lado a lado, depois funde as duas listas ordenadas — tipicamente com Reciprocal Rank Fusion (RRF) — em um único conjunto de resultados.",
        },
        why: {
          en: "Dense vectors capture meaning but miss exact terms (names, codes, acronyms); keyword search nails those but misses paraphrase. Fusing both recovers what either alone would drop. Today retrieval is dense-only; Intermediate adds the hybrid path.",
          pt: "Vetores densos captam significado mas erram termos exatos (nomes, códigos, siglas); a busca por palavra-chave acerta esses mas erra paráfrases. Fundir as duas recupera o que cada uma sozinha deixaria passar. Hoje a recuperação é só densa; o Intermediário adiciona o caminho híbrido.",
        },
        where: "backend/app/rag/retriever.py (today: dense-only) · Intermediate preview",
      },
      {
        id: "llm-gateway",
        title: { en: "LLM gateway", pt: "Gateway de LLM" },
        what: {
          en: "A proxy every model call goes through: it handles auth and routing across providers/models, retries and fallbacks, rate limits and quotas, and centralizes cost tracking and logging.",
          pt: "Um proxy por onde passa cada chamada ao modelo: cuida de autenticação e roteamento entre provedores/modelos, retries e fallbacks, limites de taxa e cotas, e centraliza o controle de custo e o logging.",
        },
        why: {
          en: "Calling provider SDKs straight from app code scatters keys, retries and cost logic everywhere. A gateway is one control point for reliability, governance and FinOps — swap a model or add a budget cap without touching the agent.",
          pt: "Chamar os SDKs dos provedores direto do código da app espalha chaves, retries e lógica de custo por toda parte. Um gateway é um único ponto de controle para confiabilidade, governança e FinOps — troque um modelo ou adicione um teto de orçamento sem tocar no agente.",
        },
        where: "stations.ts · station 'gateway' (Advanced preview)",
      },
      {
        id: "guardrails",
        title: { en: "Guardrails (input / output)", pt: "Guardrails (entrada / saída)" },
        what: {
          en: "Checks that wrap the model: input guardrails screen the user's message (prompt-injection, PII, off-topic, jailbreaks) before it reaches the agent; output guardrails validate the answer (toxicity, leaked secrets, schema/format) before it reaches the user.",
          pt: "Verificações que envolvem o modelo: guardrails de entrada filtram a mensagem do usuário (injeção de prompt, PII, fora de tópico, jailbreaks) antes de chegar ao agente; guardrails de saída validam a resposta (toxicidade, segredos vazados, esquema/formato) antes de chegar ao usuário.",
        },
        why: {
          en: "An LLM will happily follow a malicious instruction or emit something unsafe. Guardrails are the safety boundary that makes an agent shippable in front of real users — and they fail closed, blocking rather than guessing.",
          pt: "Um LLM seguirá de bom grado uma instrução maliciosa ou emitirá algo inseguro. Guardrails são a fronteira de segurança que torna um agente publicável diante de usuários reais — e falham fechando, bloqueando em vez de adivinhar.",
        },
        where: "stations.ts · station 'guardrails' (Advanced preview)",
      },
      {
        id: "semantic-cache",
        title: { en: "Semantic cache", pt: "Cache semântico" },
        what: {
          en: "A cache keyed by meaning, not exact text: it embeds the incoming query and, if a past query is close enough in vector space, returns the stored answer instead of calling the model.",
          pt: "Um cache indexado por significado, não por texto exato: gera o embedding da consulta que chega e, se uma consulta passada estiver próxima o suficiente no espaço vetorial, retorna a resposta armazenada em vez de chamar o modelo.",
        },
        why: {
          en: "Many users ask the same thing in different words. A semantic cache turns those into instant, near-zero-cost hits — cutting latency and spend — where an exact-match cache would miss on any rephrase.",
          pt: "Muitos usuários perguntam a mesma coisa com palavras diferentes. Um cache semântico transforma isso em acertos instantâneos e de custo quase zero — cortando latência e gasto — onde um cache de correspondência exata erraria a qualquer reformulação.",
        },
        where: "stations.ts · station 'cache' (Advanced preview)",
      },
      {
        id: "eval-runner",
        title: { en: "Eval runner", pt: "Eval runner (avaliações)" },
        what: {
          en: "An automated way to score agent quality: a dataset of inputs with graded outputs, run offline in CI (did this change make answers better or worse?) and online on live traffic (LLM-as-judge, faithfulness, relevance).",
          pt: "Uma forma automatizada de pontuar a qualidade do agente: um conjunto de entradas com saídas avaliadas, rodado offline na CI (essa mudança deixou as respostas melhores ou piores?) e online no tráfego real (LLM como juiz, fidelidade, relevância).",
        },
        why: {
          en: "'It looks good in the demo' isn't a quality bar. Evals turn agent quality into a regression-testable number, so you ship changes with evidence instead of vibes — the same red→green discipline this project applies to code, applied to answers.",
          pt: "'Parece bom na demo' não é um critério de qualidade. As avaliações transformam a qualidade do agente em um número testável contra regressões, para você publicar mudanças com evidência em vez de achismo — a mesma disciplina red→green que este projeto aplica ao código, aplicada às respostas.",
        },
        where: "stations.ts · station 'eval' (Advanced preview)",
      },
      {
        id: "observability",
        title: { en: "Observability & tracing", pt: "Observabilidade e tracing" },
        what: {
          en: "LLM-native telemetry: every request emits a trace of spans (retrieval, each reasoning round, tool calls, generation) with tokens, cost, latency and the real prompts — shipped to a sink (e.g. an OpenTelemetry / LLM-observability backend) you can query and alert on.",
          pt: "Telemetria nativa de LLM: cada requisição emite um trace de spans (recuperação, cada rodada de raciocínio, chamadas de ferramentas, geração) com tokens, custo, latência e os prompts reais — enviados a um sink (ex.: um backend de OpenTelemetry / observabilidade de LLM) onde você consulta e cria alertas.",
        },
        why: {
          en: "You can't debug or improve what you can't see. In production an agent is a distributed, non-deterministic system; tracing every step is how you find the slow hop, the costly round, or the prompt that went wrong. This whole app is a teaching-grade version of exactly that.",
          pt: "Você não depura nem melhora o que não consegue ver. Em produção um agente é um sistema distribuído e não determinístico; rastrear cada passo é como você acha o salto lento, a rodada cara ou o prompt que deu errado. Este app inteiro é uma versão didática exatamente disso.",
        },
        where: "stations.ts · station 'observability' (Advanced preview)",
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
