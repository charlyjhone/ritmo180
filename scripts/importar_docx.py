#!/usr/bin/env python3
"""Converte as apostilas autorais em DOCX (Eletrodinâmica e Eletrostática em Contexto, de Charly Jhone)
para o formato canônico do Ritmo 180.

Uso: python3 -I scripts/importar_docx.py "<pasta das apostilas>" <saida.json>

Lê o document.xml do próprio DOCX, sem bibliotecas externas. Tabelas viram <table>, figuras viram
imagem embutida (reduzida para 1 000 px de largura com o sips do macOS). A revisão editorial
(comandos que faltavam, resoluções escritas na revisão, posição do gabarito) fica em
scripts/docx_revisao.json. As questões vão para a fila de revisão: npm run ingest -- <saida> --revisar
"""
import base64
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

AQUI = os.path.dirname(os.path.abspath(__file__))
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
NOTA = "Autoria de Charly Jhone; uso confirmado pelo autor em 21/11/2026."
LETRAS = "ABCDE"
ALT = re.compile(r"^([A-E])\)\s*(.*)$")
# Matriz de Ciências da Natureza: a competência de cada habilidade.
COMPETENCIA = {**{h: 1 for h in range(1, 5)}, **{h: 2 for h in range(5, 8)}, **{h: 3 for h in range(8, 13)},
               **{h: 4 for h in range(13, 17)}, **{h: 5 for h in range(17, 20)}, **{h: 6 for h in range(20, 24)},
               **{h: 7 for h in range(24, 28)}, **{h: 8 for h in range(28, 31)}}


# ---------------------------------------------------------------- leitura do DOCX


class Doc:
    """Corpo do documento como lista de blocos: ("p", estilo, texto, [imagens]) ou ("tbl", linhas)."""

    def __init__(self, caminho, trabalho):
        self.zip = zipfile.ZipFile(caminho)
        rels = ET.fromstring(self.zip.read("word/_rels/document.xml.rels"))
        self.rels = {r.get("Id"): r.get("Target") for r in rels}
        self.trabalho = trabalho
        self.cache = {}
        corpo = ET.fromstring(self.zip.read("word/document.xml")).find(W + "body")
        self.blocos = []
        for el in corpo:
            if el.tag == W + "p":
                texto, imagens = self._paragrafo(el)
                estilo = el.find(f"{W}pPr/{W}pStyle")
                if texto.strip() or imagens:
                    self.blocos.append(("p", estilo.get(W + "val") if estilo is not None else "", texto.strip(), imagens))
            elif el.tag == W + "tbl":
                linhas = [[self._paragrafo(tc)[0].strip() for tc in tr.findall(W + "tc")] for tr in el.findall(W + "tr")]
                self.blocos.append(("tbl", linhas))

    def _paragrafo(self, el):
        partes, imagens = [], []
        for n in el.iter():
            if n.tag == W + "t":
                partes.append(n.text or "")
            elif n.tag == W + "tab":
                partes.append(" ")
            elif n.tag == W + "br":
                partes.append(" ")
            elif n.tag == A + "blip":
                imagens.append(self.rels[n.get(R + "embed")])
        return re.sub(r"[  ]+", " ", "".join(partes)), imagens

    def imagem(self, alvo):
        """PNG da figura, reduzido para no máximo 1 000 px de largura, em base64."""
        if alvo not in self.cache:
            origem = os.path.join(self.trabalho, os.path.basename(alvo))
            with open(origem, "wb") as f:
                f.write(self.zip.read("word/" + alvo))
            subprocess.run(["sips", "--resampleWidth", "1000", origem], check=True, capture_output=True) \
                if int(re.search(rb"pixelWidth: (\d+)", subprocess.run(["sips", "-g", "pixelWidth", origem], capture_output=True).stdout).group(1)) > 1000 else None
            with open(origem, "rb") as f:
                self.cache[alvo] = base64.b64encode(f.read()).decode()
        return self.cache[alvo]


def esc(texto):
    return html.escape(texto, quote=False)


def html_tabela(linhas):
    cab, *resto = linhas
    th = "".join(f"<th>{esc(c)}</th>" for c in cab)
    td = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in l) + "</tr>" for l in resto)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{td}</tbody></table>"


def html_blocos(doc, blocos, alt):
    saida = []
    for b in blocos:
        if b[0] == "tbl":
            saida.append(html_tabela(b[1]))
            continue
        _, estilo, texto, imagens = b
        for img in imagens:
            saida.append(f'<p><img src="data:image/png;base64,{doc.imagem(img)}" alt="{html.escape(alt)}"></p>')
        if texto:
            classe = ' class="fonte"' if estilo in ("Fontedetabela", "Caption") or texto.startswith(("Fonte:", "Contexto inspirado")) else ""
            saida.append(f"<p{classe}>{esc(texto)}</p>")
    return "".join(saida)


def habilidades(texto):
    """'C2/H6; C6/H21' ou 'H17 + H21' ou 'H5/H6': a primeira habilidade e sua competência."""
    m = re.search(r"H(\d{1,2})", texto or "")
    if not m:
        return {}
    h = int(m.group(1))
    return {"skill": f"H{h}", "competency": f"C{COMPETENCIA[h]}"}


def separar(blocos):
    """Divide os blocos de uma questão em (texto-base, comando, alternativas)."""
    inicio = next(i for i, b in enumerate(blocos) if b[0] == "p" and ALT.match(b[2]) and ALT.match(b[2]).group(1) == "A")
    alternativas = [ALT.match(b[2]).group(2).strip() for b in blocos[inicio:inicio + 5]]
    assert [ALT.match(b[2]).group(1) for b in blocos[inicio:inicio + 5]] == list(LETRAS), blocos[inicio:inicio + 5]
    antes = blocos[:inicio]
    # O comando é o último parágrafo de texto antes das alternativas que não é legenda nem só figura.
    candidatos = [i for i, b in enumerate(antes) if b[0] == "p" and b[2] and b[1] not in ("Fontedetabela", "Caption") and not b[2].startswith("Fonte:")]
    return antes, candidatos, alternativas


def item(external, topico, contexto, comando, alternativas, resposta, solucao, traps=None, extra=None):
    saida = {
        "externalId": external,
        "source": "authored",
        "area": "CN",
        "discipline": "Física",
        "topic": topico,
        "contextHtml": contexto,
        "stemHtml": f"<p>{esc(comando)}</p>",
        "alternatives": [{"letter": l, "html": f"<p>{esc(t)}</p>", **({"trap": traps[l]} if traps and traps.get(l) and l != resposta else {})}
                         for l, t in zip(LETRAS, alternativas)],
        "answer": resposta,
        "solutionHtml": solucao,
        "prerequisites": [],
        "rightsCleared": True,
        "rightsNote": NOTA,
    }
    saida.update(extra or {})
    return saida


def comando_e_contexto(doc, blocos, alt):
    """Último parágrafo vira comando; se ele carrega também a situação, a última frase é o comando."""
    antes, candidatos, alternativas = separar(blocos)
    k = candidatos[-1]
    texto = antes[k][2]
    resto = antes[:k] + antes[k + 1:]
    frases = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ])", texto)
    if len(frases) > 1 and k == candidatos[0]:
        # Parágrafo único com situação e pergunta: a situação vai para o texto-base.
        resto = antes[:k] + [("p", "", " ".join(frases[:-1]), [])] + antes[k + 1:]
        texto = frases[-1]
    return html_blocos(doc, resto, alt), texto, alternativas


# ---------------------------------------------------------------- Eletrodinâmica em Contexto


def eletrodinamica(doc):
    B = doc.blocos
    itens = []

    def pos(pred, depois=0):
        return next(i for i in range(depois, len(B)) if pred(B[i]))

    # Capítulo 1: questões 1.01–1.20 e o gabarito comentado da seção 1.10.
    ini = pos(lambda b: b[0] == "p" and b[1] == "Heading4" and b[2] == "Questão 1.01")
    fim = pos(lambda b: b[0] == "p" and b[1] == "Heading3" and b[2].startswith("Respostas construídas"), ini)
    gab_ini = pos(lambda b: b[0] == "p" and b[2].startswith("1.10 Gabarito comentado"), fim)
    gab_fim = pos(lambda b: b[0] == "p" and b[1] == "Heading2" and b[2].startswith("1.11"), gab_ini)
    gabarito = {}
    atual = None
    for b in B[gab_ini:gab_fim]:
        if b[0] != "p":
            continue
        m = re.match(r"Questão (1\.\d\d) — resposta ([A-E])", b[2])
        if m:
            atual = gabarito[m.group(1)] = {"answer": m.group(2), "res": "", "traps": {}, "erro": ""}
        elif atual is not None:
            if b[2].startswith("Resolução:"):
                atual["res"] = b[2][len("Resolução:"):].strip()
            elif b[1] == "Fichatecnica" and ALT.match(b[2]):
                letra, texto = ALT.match(b[2]).groups()
                # "A) A desloca a vírgula..." → "Desloca a vírgula..."
                texto = re.sub(rf"^{letra}\s+(\w)", lambda x: x.group(1).upper(), texto.strip())
                atual["traps"][letra] = texto
            elif b[2].startswith("Erro diagnosticado:"):
                atual["erro"] = b[2][len("Erro diagnosticado:"):].strip()
    questoes, n = {}, None
    for b in B[ini:fim]:
        if b[0] == "p" and b[1] == "Heading4":
            n = re.match(r"Questão (1\.\d\d)", b[2]).group(1)
            questoes[n] = []
        elif b[0] == "p" and b[1] == "Heading3":
            continue
        elif n:
            questoes[n].append(b)
    for n, blocos in questoes.items():
        ficha = next((b[2] for b in blocos if b[0] == "p" and b[1] == "Fichatecnica"), "")
        blocos = [b for b in blocos if not (b[0] == "p" and b[1] == "Fichatecnica")]
        contexto, comando, alternativas = comando_e_contexto(doc, blocos, "Figura da questão")
        g = gabarito[n]
        solucao = f"<p>{esc(g['res'])}</p>" + (f"<p><strong>Erro comum:</strong> {esc(g['erro'])}</p>" if g["erro"] else "")
        itens.append(item(f"apostila-eletrodinamica-2026-{n.replace('.', '')}", "Eletrodinâmica", contexto, comando, alternativas,
                          g["answer"], solucao, g["traps"], habilidades(ficha)))

    # Caderno especial 1: banco CE1.01–CE1.40 e o gabarito estratégico.
    ini = pos(lambda b: b[0] == "p" and b[2].startswith("7. Banco de alta aderência"))
    fim = pos(lambda b: b[0] == "p" and b[2].startswith("8. Gabarito estratégico"), ini)
    gab_fim = pos(lambda b: b[0] == "p" and b[2].startswith("9. Índice"), fim)
    gabarito = {}
    for b in B[fim:gab_fim]:
        if b[0] == "tbl":
            for linha in b[1]:
                if re.match(r"CE1\.\d\d$", linha[0]):
                    gabarito[linha[0]] = {"answer": linha[1], "res": linha[2], "erro": linha[3]}
    questoes, n = {}, None
    for b in B[ini + 1:fim]:
        if b[0] == "tbl" and re.match(r"CE1\.\d\d$", b[1][0][0]):
            n = b[1][0][0]
            questoes[n] = {"titulo": b[1][0][1], "blocos": []}
        elif n:
            questoes[n]["blocos"].append(b)
    for n, q in questoes.items():
        blocos = [b for b in q["blocos"] if not (b[0] == "p" and b[2] in ("/",))]
        ficha = next((b[2] for b in blocos if b[0] == "p" and b[2].startswith("Dificuldade:")), "")
        blocos = [b for b in blocos if not (b[0] == "p" and b[2].startswith("Dificuldade:"))]
        contexto, comando, alternativas = comando_e_contexto(doc, blocos, q["titulo"])
        g = gabarito[n]
        solucao = f"<p>{esc(g['res'])}</p><p><strong>Erro comum:</strong> {esc(g['erro'])}</p>"
        contexto = f"<p><strong>{esc(q['titulo'])}</strong></p>" + contexto
        itens.append(item(f"apostila-eletrodinamica-2026-ce1{n[-2:]}", "Eletrodinâmica", contexto, comando, alternativas,
                          g["answer"], solucao, None, habilidades(ficha)))
    return itens


# ---------------------------------------------------------------- Eletrostática em Contexto


def eletrostatica(doc, revisao):
    B = doc.blocos
    itens = []
    # Capítulo 1: "1.01 — FUNDAMENTOS | enunciado", alternativas e "GABARITO COMENTADO | D. explicação".
    i = 0
    while i < len(B):
        b = B[i]
        m = b[0] == "p" and re.match(r"(1\.0\d) — ([^|]+?) \| (.*)$", b[2])
        if m:
            n, rotulo, enunciado = m.groups()
            alternativas = [ALT.match(B[i + k][2]).group(2) for k in range(1, 6)]
            g = re.match(r"GABARITO COMENTADO \| ([A-E])\. (.*)$", B[i + 6][2])
            frases = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ])", enunciado)
            contexto = f"<p>{esc(' '.join(frases[:-1]))}</p>" if len(frases) > 1 else ""
            itens.append(item(f"apostila-eletrostatica-2026-{n.replace('.', '')}", "Eletroestática", contexto, frases[-1], alternativas,
                              g.group(1), f"<p>{esc(g.group(2))}</p>", None, habilidades(rotulo)))
            i += 7
            continue
        i += 1

    # Questões com título próprio: EV01–EV10, E3.01–E3.08, E5.01–E5.08, E4.01–E4.08.
    gabarito = {}
    for b in B:
        if b[0] == "tbl" and b[1][0][:2] in (["Questão", "Resposta"], ["Item", "Resposta"]):
            for linha in b[1][1:]:
                gabarito[linha[0]] = {"answer": linha[1], "res": linha[3] if b[1][0][0] == "Item" else ""}
    titulos = [k for k, b in enumerate(B) if b[0] == "p" and b[1] == "Heading1" and re.match(r"Questão (EV\d\d|E\d\.\d\d) — ", b[2])]
    for k in titulos:
        n, titulo = re.match(r"Questão (EV\d\d|E\d\.\d\d) — (.*)$", B[k][2]).groups()
        # A linha "NÍVEL: ..." vem antes do título (EV) ou logo depois dele (E3, E4, E5).
        fim = next(j for j in range(k + 2, len(B)) if B[j][0] == "p" and (B[j][1] == "Heading1" or B[j][2] == "/" or B[j][2].startswith("NÍVEL:")))
        blocos = B[k + 1:fim]
        nivel = B[k - 1][2] if B[k - 1][0] == "p" and B[k - 1][2].startswith("NÍVEL:") else ""
        nivel = nivel or next((b[2] for b in blocos if b[0] == "p" and b[2].startswith("NÍVEL:")), "")
        blocos = [b for b in blocos if not (b[0] == "p" and (b[2].startswith(("NÍVEL:", "Habilidade em foco:"))))]
        rev = revisao["questoes"].get(n, {})
        if rev.get("comando"):
            # Questão sem frase de comando no original: entra a da revisão, logo antes das alternativas.
            a = next(j for j, b in enumerate(blocos) if b[0] == "p" and ALT.match(b[2]) and b[2].startswith("A)"))
            blocos = blocos[:a] + [("p", "", rev["comando"], [])] + blocos[a:]
        contexto, comando, alternativas = comando_e_contexto(doc, blocos, titulo)
        contexto = f"<p><strong>{esc(titulo)}</strong></p>" + contexto
        g = gabarito[n]
        res = rev.get("resolucao") or g["res"]
        itens.append(item(f"apostila-eletrostatica-2026-{n.lower().replace('.', '')}", "Eletroestática", contexto, comando, alternativas,
                          g["answer"], f"<p>{esc(res)}</p>" if res else "", None, habilidades(nivel.split("ENEM:")[-1])))
    return itens


# ---------------------------------------------------------------- gabarito equilibrado


def letra_presa(alternativas):
    """Alternativas cuja ordem tem sentido (números crescentes, 'Modo A', 'Somente B', 'I e II') não mudam de lugar."""
    for t in alternativas:
        if re.match(r"^[\d−-]|^R\$|^(Modo|Material|Setor|Somente|Todos|Nenhum)\b|^[A-E]$|^[IV]+\b|^\d|para (cima|baixo|a direita|a esquerda)|^F ", t):
            return True
    return False


def equilibrar(itens, prefixo, ordem):
    """Troca a alternativa correta de lugar seguindo a ordem da revisão, só onde a ordem não importa."""
    k = 0
    for it in itens:
        if not it["externalId"].startswith(prefixo):
            continue
        textos = [re.sub(r"<[^>]+>", "", a["html"]) for a in it["alternatives"]]
        if letra_presa(textos):
            continue
        alvo = ordem[k % len(ordem)]
        k += 1
        if alvo == it["answer"]:
            continue
        alts = {a["letter"]: a for a in it["alternatives"]}
        alts[alvo]["html"], alts[it["answer"]]["html"] = alts[it["answer"]]["html"], alts[alvo]["html"]
        alts[alvo]["trap"], alts[it["answer"]]["trap"] = alts[it["answer"]].get("trap"), alts[alvo].get("trap")
        for a in (alts[alvo], alts[it["answer"]]):
            if not a.get("trap"):
                a.pop("trap", None)
        alts[alvo].pop("trap", None)
        it["answer"] = alvo


def main():
    pasta, destino = sys.argv[1], sys.argv[2]
    trabalho = tempfile.mkdtemp(prefix="docx-")
    with open(os.path.join(AQUI, "docx_revisao.json"), encoding="utf-8") as f:
        revisao = json.load(f)
    din = Doc(os.path.join(pasta, "Eletrodinamica_em_Contexto_Charly_Jhone_Entrega_01_ENEM_ampliado_FINAL.docx"), trabalho)
    est = Doc(os.path.join(pasta, "Eletrostatica_em_Contexto_Charly_Jhone_Entrega_06_Mestre_Reordenada_Contextualizada.docx"), trabalho)
    itens = eletrodinamica(din) + eletrostatica(est, revisao)
    fora = set(revisao.get("fora", []))
    itens = [it for it in itens if it["externalId"] not in fora]
    equilibrar(itens, "apostila-eletrostatica-2026-", revisao["ordem_eletrostatica"])
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(itens, f, ensure_ascii=False, indent=1)
    print(f"{len(itens)} questões gravadas em {destino}")


if __name__ == "__main__":
    main()
