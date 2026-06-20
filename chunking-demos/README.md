# PDFs de demonstração — estratégias de chunking

Dois PDFs feitos para **mostrar na prática** a diferença entre as quatro
estratégias de chunking (Settings → Knowledge base): `fixed`, `recursive`,
`semantic`, `agentic`.

Gerados por [`scripts/gen_chunking_demo_pdfs.py`](../scripts/gen_chunking_demo_pdfs.py),
que também imprime os chunks de cada estratégia para conferência.

## Como demonstrar

1. **Settings → Knowledge base** → escolha a estratégia (`Fixed`, `Recursive`,
   `Semantic`, `Agentic`).
2. No chat, anexe (📎) um dos PDFs abaixo e envie. A ingestão roda com a
   estratégia ativa e o canvas anima `chunk → embed → store`.
3. Abra o drill-in da estação **Ingestão / Vector DB** para ver os chunks reais.
4. Troque a estratégia e reenvie o **mesmo** PDF para comparar.

> Dica: limpe as bases entre rodadas (Settings → *Clear databases*) para não
> acumular vetores das execuções anteriores.

## Por que cada PDF foi montado assim

> Detalhe técnico: o extrator de PDF (pypdf) **não** preserva linhas em branco
> entre parágrafos dentro de uma página — só a **quebra de página** vira o
> `\n\n` que o `recursive` usa como fronteira. Por isso cada parágrafo está em
> sua própria página.

### `01-estrutura-fixed-vs-recursive.pdf` — estrutura vs. corte cego

Um único tema (banco de dados vetorial) em parágrafos de tamanhos variados.
Destaca **Fixed vs. Recursive**:

| Estratégia | Resultado | O que mostrar |
|---|---|---|
| **Fixed** | 3 chunks de exatos 900 caracteres | corta **no meio de palavra/frase** (ex.: `…encontra v` / `sa-se um indice…`) |
| **Recursive** | 3 chunks | termina sempre em fim de frase (`…entre os pontos.`, `…dois pedacos.`) |
| **Semantic** | ~9 chunks | quebra a cada micro-mudança de subtópico |
| **Agentic** | ~6 chunks | unidades coerentes (a LLM até isola o título) |

### `02-topicos-semantic-vs-agentic.pdf` — significado vs. tamanho

Cinco assuntos **sem nenhuma relação** entre si (café, Marte, futebol,
fotossíntese, culinária italiana). Destaca **Semantic/Agentic vs. Recursive**:

| Estratégia | Resultado | O que mostrar |
|---|---|---|
| **Fixed** | 2 chunks | corta no meio de um tópico (`…histo` \| `ria…`) e mistura assuntos |
| **Recursive** | 3 chunks | agrupa **por tamanho**, então **mistura tópicos** (café+Marte num chunk) |
| **Semantic** | ~12 chunks | separa por mudança de assunto (um grupo de frases por tópico) |
| **Agentic** | **5 chunks = os 5 tópicos** | um chunk coerente por assunto — o exemplo mais claro |

O contraste mais didático é o Doc 2: **Recursive mistura assuntos** porque só
olha o tamanho, enquanto **Agentic devolve exatamente um chunk por tópico**.

## Regenerar

```bash
backend/.venv/bin/python scripts/gen_chunking_demo_pdfs.py
```

Os números exatos de `semantic`/`agentic` podem variar um pouco entre execuções
(dependem do modelo / embeddings da OpenAI); `fixed` e `recursive` são
determinísticos.
