#!/usr/bin/env python3
"""Localiza cada questão nos livros em PDF e recorta suas figuras.

O texto vem de banco_ENEM_2009_2025_v2.json. Este script só acrescenta o que a extração
de texto perdeu: figuras, fórmulas em imagem e alternativas em imagem.

Uso: extrair_figuras_livros.py <pasta dos PDFs> <banco v2.json> <pasta de saída> [FIS QUI BIO MAT]
Requer pypdfium2 e pillow. A saída contém material dos livros e não entra no Git.
"""
import ctypes
import difflib
import json
import os
import re
import sys
import unicodedata

import pypdfium2 as pdfium
import pypdfium2.raw as raw

LIVROS = {"FIS": "FI%3FSICA+2025.pdf", "QUI": "QUI%3FMICA+2025.pdf", "BIO": "BIOLOGIA+2025.pdf", "MAT": "MATEMA%3FTICA+2026.pdf"}
MEIO = 297.6
RODAPE = 60
ESCALA = 2.5
PAD = 2
INLINE_ALTURA = 26
CABECALHO = re.compile(r"^\s*(\d{1,3})\s*\.?\s*\(\s*(.*)$")
ALTERNATIVA = re.compile(r"^\s*([A-E])\s*\)")
IMAGEM = 3
HIFEN = "\u00ad"


def normal(texto):
    limpo = unicodedata.normalize("NFD", texto.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in limpo if not unicodedata.combining(c)))


def linhas_da_pagina(pagina):
    tp = pagina.get_textpage()
    x, y = ctypes.c_double(), ctypes.c_double()
    colunas = {0: [], 1: []}
    for i in range(tp.count_chars()):
        ch = tp.get_text_range(i, 1)
        if ch in "\r\n￾":
            continue
        if ch == "\x02":
            ch = HIFEN
        raw.FPDFText_GetCharOrigin(tp, i, x, y)
        if y.value < RODAPE:
            continue
        colunas[0 if x.value < MEIO else 1].append((round(y.value, 1), x.value, ch))
    linhas = []
    for coluna, chars in colunas.items():
        chars.sort(key=lambda c: (-c[0], c[1]))
        atual, base = [], None
        for c in chars:
            if base is not None and abs(c[0] - base) > 3:
                linhas.append(fecha(coluna, base, atual))
                atual = []
            base = c[0] if not atual else base
            atual.append(c)
        if atual:
            linhas.append(fecha(coluna, base, atual))
    return linhas


def fecha(coluna, base, chars):
    chars = sorted(chars, key=lambda c: c[1])
    return {"tipo": "linha", "col": coluna, "y": base + 4, "topo": base + 10, "base": base - 3, "x": chars[0][1], "x1": chars[-1][1] + 6, "texto": "".join(c[2] for c in chars).strip()}


def imagens_da_pagina(pagina):
    largura, altura = pagina.get_size()
    saida = []
    for obj in pagina.get_objects(max_depth=3):
        if obj.type != IMAGEM:
            continue
        x0, y0, x1, y1 = obj.get_bounds()
        if y1 < RODAPE or (x1 - x0) * (y1 - y0) > 0.7 * largura * altura or y1 - y0 < 5:
            continue
        saida.append({"tipo": "imagem", "col": 0 if (x0 + x1) / 2 < MEIO else 1, "y": (y0 + y1) / 2, "caixa": [x0, y0, x1, y1]})
    return saida


def recorta(pagina, caixa, destino):
    largura, altura = pagina.get_size()
    x0, y0, x1, y1 = caixa
    corte = (max(0, x0 - PAD), max(0, y0 - PAD), max(0, largura - x1 - PAD), max(0, altura - y1 - PAD))
    imagem = pagina.render(scale=ESCALA, crop=corte).to_pil().convert("RGB")
    imagem.save(destino, "WEBP", quality=78, method=6)
    return imagem.size


def questoes_do_livro(documento):
    """Percorre as páginas na ordem de leitura e reparte linhas e imagens entre as questões."""
    questoes, atual, vaga = [], None, None
    for numero in range(len(documento)):
        pagina = documento[numero]
        linhas = linhas_da_pagina(pagina)
        if not linhas:
            continue
        imagens = imagens_da_pagina(pagina)
        for img in imagens:
            marcas = [l for l in linhas if l["col"] == img["col"] and img["caixa"][1] - 2 <= l["y"] <= img["caixa"][3] + 2 and ALTERNATIVA.match(l["texto"]) and l["x"] <= img["caixa"][0]]
            if marcas:
                img["letras"] = [ALTERNATIVA.match(l["texto"])[1] for l in marcas]
                img["y"] = marcas[0]["y"] - 0.5
        elementos = sorted(linhas + imagens, key=lambda e: (e["col"], -e["y"]))
        for e in elementos:
            if e["tipo"] == "linha":
                cab = CABECALHO.match(e["texto"])
                alt = ALTERNATIVA.match(e["texto"])
                if cab and (cab[2][:4].upper() == "ENEM" or ("." in e["texto"][:cab.start(2)] and (cab[2][:1].isupper() or cab[2][:1].isdigit()))):
                    atual = {"num": int(cab[1]), "cabecalho": e["texto"], "pagina": numero, "partes": {"stem": []}, "ordem": []}
                    questoes.append(atual)
                    vaga = "stem"
                elif atual is not None and alt:
                    vaga = alt[1]
                    atual["partes"].setdefault(vaga, [])
                    resto = e["texto"][alt.end():].strip()
                    if resto:
                        atual["partes"][vaga].append({"tipo": "linha", "texto": resto, "pagina": numero, "col": e["col"], "topo": e["topo"], "base": e["base"], "x": e["x"], "x1": e["x1"]})
                elif atual is not None:
                    atual["partes"][vaga].append({"tipo": "linha", "texto": e["texto"], "pagina": numero, "col": e["col"], "topo": e["topo"], "base": e["base"], "x": e["x"], "x1": e["x1"]})
            elif atual is not None:
                destino = vaga if not e.get("letras") else e["letras"][0]
                atual["partes"].setdefault(destino, []).append({"tipo": "imagem", "pagina": numero, "caixa": e["caixa"], "letras": e.get("letras", []), "col": e["col"]})
    return questoes


def casa_com_banco(questoes, itens):
    pendentes = {}
    for item in itens:
        pendentes.setdefault(item["num_livro"], []).append(item)
    pares = []
    for q in questoes:
        texto = normal(" ".join(p["texto"] for p in q["partes"]["stem"] if p["tipo"] == "linha"))[:160]
        candidatos = pendentes.get(q["num"], [])
        melhor, nota = None, -1.0
        for item in candidatos:
            nota_item = difflib.SequenceMatcher(None, texto, normal(item.get("texto") or "")[:160]).ratio()
            if nota_item > nota:
                melhor, nota = item, nota_item
        if melhor is not None and (nota >= 0.55 or not (melhor.get("texto") or "")):
            candidatos.remove(melhor)
            pares.append((q, melhor, nota))
    return pares


def trecho_antes(partes, indice):
    for parte in reversed(partes[:indice]):
        if parte["tipo"] == "linha":
            return parte["texto"]
    return ""


def processa(livro, caminho, itens, saida):
    documento = pdfium.PdfDocument(caminho)
    questoes = questoes_do_livro(documento)
    pares = casa_com_banco(questoes, itens)
    pasta = os.path.join(saida, "figuras")
    os.makedirs(pasta, exist_ok=True)
    resultado = {}
    for q, item, nota in pares:
        registro = {"pagina": q["pagina"], "nota": round(nota, 3), "figuras": []}
        for vaga, partes in q["partes"].items():
            for i, parte in enumerate(partes):
                if parte["tipo"] != "imagem":
                    continue
                caixa = parte["caixa"]
                nome = f"{item['id']}-{len(registro['figuras'])}.webp"
                tamanho = recorta(documento[parte["pagina"]], caixa, os.path.join(pasta, nome))
                inline = caixa[3] - caixa[1] < INLINE_ALTURA and vaga == "stem"
                registro["figuras"].append({"arquivo": nome, "vaga": vaga, "letras": parte["letras"], "antes": trecho_antes(partes, i)[-60:], "inline": inline, "tamanho": tamanho})
        registro["alternativas"] = {v: " ".join(p["texto"] for p in ps if p["tipo"] == "linha") for v, ps in q["partes"].items() if v != "stem"}
        registro["enunciado"] = " ".join(p["texto"] for p in q["partes"]["stem"] if p["tipo"] == "linha")
        resultado[item["id"]] = registro
    print(livro, "cabeçalhos", len(questoes), "ligadas", len(pares), "do banco", len(itens), "figuras", sum(len(r["figuras"]) for r in resultado.values()))
    return resultado


def main():
    pasta_pdf, banco, saida, *escolhidos = sys.argv[1:]
    itens = json.load(open(banco, encoding="utf-8"))["itens"]
    os.makedirs(saida, exist_ok=True)
    tudo = {}
    for livro in escolhidos or LIVROS:
        tudo.update(processa(livro, os.path.join(pasta_pdf, LIVROS[livro]), [i for i in itens if i["livro"] == livro], saida))
    json.dump(tudo, open(os.path.join(saida, "localizacao.json"), "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    main()
