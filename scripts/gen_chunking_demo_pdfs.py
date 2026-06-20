"""Gera PDFs de demonstração para comparar as estratégias de chunking.

Uso:
    backend/.venv/bin/python scripts/gen_chunking_demo_pdfs.py

Cria dois PDFs em ``chunking-demos/`` e imprime, para conferência, como as
estratégias *fixed* e *recursive* (as que rodam sem chave OpenAI) fatiam cada
documento — provando que as diferenças aparecem na prática antes de você subir
os arquivos na aplicação.

  - Doc 1 (estrutura): um único tema, parágrafos de tamanhos variados.
      Fixed     -> corta no meio de frases/palavras (no caractere 900).
      Recursive -> respeita as quebras de parágrafo.

  - Doc 2 (tópicos): vários assuntos sem relação entre si, em sequência.
      Semantic  -> abre um chunk novo exatamente na troca de assunto.
      Agentic   -> agrupa por unidade temática coerente.

Detalhe importante (descoberto na prática): o extrator de PDF padrão (pypdf)
NÃO preserva linhas em branco entre parágrafos dentro de uma mesma página — ele
junta tudo com um único "\n". A ÚNICA fronteira que sobrevive e vira "\n\n" (que
o chunker *recursive* usa) é a quebra de PÁGINA. Por isso cada parágrafo é
colocado em sua própria página: assim o recursive enxerga as fronteiras de
verdade, em vez de produzir um único chunk gigante.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fpdf import FPDF

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "chunking-demos"

# Torna os chunkers do backend importáveis sem instalar o pacote.
sys.path.insert(0, str(REPO / "backend"))


# --- Conteúdo dos documentos -------------------------------------------------
#
# Cada string da lista é UM parágrafo. O gerador insere uma linha em branco
# entre eles, para que o extrator de PDF preserve o "\n\n" que o chunker
# *recursive* usa como fronteira.

DOC1_TITLE = "Banco de Dados Vetorial: um guia direto"
DOC1_PARAGRAPHS = [
    "Um banco de dados vetorial armazena representacoes numericas de textos, "
    "imagens ou audios chamadas de embeddings. Cada embedding e um vetor com "
    "centenas de dimensoes que captura o significado do conteudo original, de "
    "modo que itens parecidos ficam proximos no espaco vetorial e itens "
    "diferentes ficam distantes uns dos outros.",

    "A busca nesse tipo de banco nao procura palavras exatas, e sim "
    "vizinhanca. Quando voce faz uma pergunta, ela tambem vira um vetor e o "
    "banco devolve os trechos cujos vetores estao mais perto do vetor da "
    "pergunta. Essa proximidade costuma ser medida por similaridade de cosseno "
    "ou por distancia euclidiana entre os pontos.",

    "Para que a busca seja rapida mesmo com milhoes de vetores, usa-se um "
    "indice aproximado como o HNSW. Em vez de comparar a consulta com todos os "
    "vetores, o indice navega por um grafo de poucos saltos e encontra "
    "vizinhos muito bons em tempo quase constante, trocando um pouco de "
    "precisao por uma enorme ganho de velocidade.",

    "Antes de indexar, os documentos precisam ser quebrados em pedacos "
    "menores, os chamados chunks. O tamanho do chunk e o tamanho da "
    "sobreposicao entre eles influenciam diretamente a qualidade da "
    "recuperacao: chunks grandes preservam contexto, chunks pequenos recuperam "
    "com mais precisao, e a sobreposicao evita que uma ideia se perca bem na "
    "fronteira de dois pedacos.",

    "Por fim, o banco vetorial raramente trabalha sozinho. Ele costuma fazer "
    "parte de um pipeline de RAG, onde os trechos recuperados sao enviados "
    "como contexto para um modelo de linguagem gerar a resposta final. A "
    "qualidade do chunking, do embedding e do reordenamento define o teto de "
    "tudo o que vem depois nessa cadeia.",
]

DOC2_TITLE = "Cinco assuntos sem nenhuma relacao entre si"
DOC2_PARAGRAPHS = [
    # Tópico A — Café
    "O cafe nasce de uma fruta vermelha chamada cereja, que envolve os graos "
    "verdes. Depois da colheita, os graos passam por secagem, torra e moagem "
    "ate virarem o po que conhecemos. A torra mais escura traz amargor e corpo, "
    "enquanto a torra clara preserva notas mais acidas e frutadas da bebida.",

    # Tópico B — Marte
    "Marte e o quarto planeta a partir do Sol e tem cor avermelhada por causa "
    "do oxido de ferro em sua superficie. Ele abriga o maior vulcao do sistema "
    "solar, o Monte Olimpo, com quase tres vezes a altura do Everest. Sondas e "
    "robos exploram o planeta em busca de sinais de agua e de vida passada.",

    # Tópico C — Futebol
    "O futebol e o esporte mais popular do mundo e movimenta paixoes em todos "
    "os continentes. A Copa do Mundo, disputada a cada quatro anos, reune as "
    "melhores selecoes em um unico torneio. O Brasil e o pais com mais titulos "
    "mundiais, somando cinco conquistas ao longo da historia da competicao.",

    # Tópico D — Fotossíntese
    "A fotossintese e o processo pelo qual as plantas transformam luz solar em "
    "energia quimica. Usando agua, gas carbonico e clorofila, elas produzem "
    "glicose e liberam oxigenio para a atmosfera. Sem esse processo, a maior "
    "parte da vida que respira oxigenio no planeta nao poderia existir.",

    # Tópico E — Culinária italiana
    "A culinaria italiana e conhecida pela simplicidade e pelos ingredientes "
    "frescos. Massas, azeite de oliva, tomate e queijos sao a base de pratos "
    "famosos como a pizza napolitana e o espaguete. Cada regiao da Italia tem "
    "suas receitas tipicas, transmitidas de geracao em geracao nas familias.",
]


def build_pdf(title: str, paragraphs: list[str], out_path: Path) -> None:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)

    # Um parágrafo por página: a quebra de página é a única fronteira que o
    # extrator de PDF transforma em "\n\n", então é assim que garantimos que o
    # chunker recursive enxergue os parágrafos.
    for n, para in enumerate(paragraphs):
        pdf.add_page()
        pdf.set_margins(left=20, top=20, right=20)
        if n == 0:
            pdf.set_font("Helvetica", style="B", size=16)
            pdf.multi_cell(0, 9, title)
            pdf.ln(4)
        pdf.set_font("Helvetica", size=12)
        pdf.multi_cell(0, 7, para)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))


def preview_chunking(out_path: Path) -> None:
    """Extrai o texto do PDF gerado e mostra como fixed/recursive o fatiam."""
    from app.rag.chunking import ChunkStrategy, chunk_texts
    from app.rag.ingestion import extract_pdf_text

    data = out_path.read_bytes()
    text = extract_pdf_text(data)
    print(f"\n{'=' * 78}\n{out_path.name}  ({len(text)} caracteres extraidos)\n{'=' * 78}")

    for strategy in ChunkStrategy:  # fixed, recursive, semantic, agentic
        try:
            chunks = chunk_texts(text, strategy)
        except Exception as exc:  # noqa: BLE001 - semantic/agentic precisam de chave
            print(f"\n--- {strategy.value.upper()} -> indisponivel ({exc})")
            continue
        print(f"\n--- {strategy.value.upper()} -> {len(chunks)} chunks ---")
        for i, c in enumerate(chunks):
            head = c[:70].replace("\n", " ")
            tail = c[-40:].replace("\n", " ")
            print(f"  [{i}] {len(c):4d} ch | inicio: {head!r}")
            print(f"           ...fim: {tail!r}")


def main() -> None:
    doc1 = OUT_DIR / "01-estrutura-fixed-vs-recursive.pdf"
    doc2 = OUT_DIR / "02-topicos-semantic-vs-agentic.pdf"

    build_pdf(DOC1_TITLE, DOC1_PARAGRAPHS, doc1)
    build_pdf(DOC2_TITLE, DOC2_PARAGRAPHS, doc2)
    print(f"PDFs gerados em: {OUT_DIR}")

    preview_chunking(doc1)
    preview_chunking(doc2)


if __name__ == "__main__":
    main()
