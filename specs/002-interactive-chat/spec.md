# Spec: Interactive Chat

| | |
|---|---|
| **ID** | 002-interactive-chat |
| **Status** | draft |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

Criar um chat interativo de verdade, mostrar mensagens no historico, permitir enviar mensagem para o agente, etc.
Tudo deve ser persistido no banco de dados local com session_id para distinguir os chats, na tela teremos a opção de criar novos chats para zerar a conversa.
No chat tambem teremos a opção de subir arquivos PDFs para serem embedados no banco vetorial e fazermos RAG dele e pesquisas vetoriais, nas conversas com arquivos quero ver todo o fluxo de RAG funcionando, buscando os Chunks no banco vetorial, mostrando como tudo funciona.
quero usar o Chroma DB para isso, vamos usar com LangChain/LangGraph, tudo sempre usando os modelos da OpenAI para embedding, ou seja pra usar arquivos é obrigatorio ter uma openAI key configurada. 
O Chat deve continuar na lateral esquerda onde ele esta, mas agora como se fosse um chat igual do whatsapp, onde temos a lista de conversas recentes e quando clica em uma conversa, abre o chat. 

## Problem / motivation
Atualmente o chat so envia uma mensagem por vez e nao tem historico visual, quero que seja um chat de verdade com conversas, mensagens, etc

## Goals
- Fazer um front que mostre uma lista de conversas na lateral esquerda
- Ao clicar em uma conversa, mostrar o historico da conversa e permitir enviar novas mensagens
- No chat, mostrar o historico real (pode usar um banco local para isso com session_id)
- No chat ter um botao de "Novo Chat" que cria uma nova conversa
- No chat ter um botao de "Upload PDF" que faz upload do PDF e embeda no banco vetorial
- No chat ter um botao de "Limpar conversa" que apaga a conversa atual
- Dentro da conversa quando tiver PDF carregado, quero ver os documentos que estao carregados para aquela conversa e permitir remover e apagar os embeddings relacionados aquele documento.
- Em cada mensagem de RAG quero ver o conteudo do Chunk que foi encontrado e usar alguma ferramenta para destacar isso na mensagem.

## Non-goals
Não vamos fazer multi-usuário agora, so um usuario por vez e sempre tudo local.

## User-facing behavior
O usuario deve poder criar quantas conversas quiser, ver o historico de cada uma, enviar mensagens, fazer upload de PDFs, remover PDFs e limpar conversa. 

## Acceptance criteria

1. **AC1** — Given eu criar uma conversa, quando eu enviar uma mensagem, então a mensagem deve aparecer no historico da conversa e eu devo ver a resposta do agente na conversa.
2. **AC2** — Given eu fizer upload de um PDF, quando o upload for concluido, então o PDF deve aparecer na lista de documentos da conversa e os chunks devem ser embedados no banco vetorial.
3. **AC3** — Given eu remover um PDF, quando o documento for removido, então os chunks relacionados aquele documento devem ser removidos do banco vetorial.
4. **AC4** — Given eu limpar a conversa, quando o botao "Limpar conversa" for clicado, então a conversa atual deve ser apagada e eu devo ver uma nova conversa.

## Protocol / stage impact

## Open questions (clarify before planning)

- [ ] …

## Out of scope / deferred

- [ ] …
