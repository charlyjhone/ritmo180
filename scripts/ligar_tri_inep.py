#!/usr/bin/env python3
"""Acrescenta o TRI oficial às questões que ainda não têm, a partir dos microdados do Inep.

A tabela ITENS_PROVA traz os parâmetros por posição na prova, sem o texto. O caminho é: texto da questão →
caderno azul oficial → posição → item. Cada ligação só vale se o texto bater e o gabarito oficial for igual.

Uso: ligar_tri_inep.py <pasta com ANO_apN_dN_*.pdf> <pasta com itens_ANO.csv> <questoes.json> [outro.json ...]
"""
import collections
import csv
import glob
import json
import os
import re
import sys
import unicodedata

import pypdfium2 as pdfium

N_GRAMA = 6
MIN_TEXTO = 0.5
MIN_GABARITO = 0.9
MIN_CONFERIDAS = 3


def palavras(texto):
    limpo = unicodedata.normalize("NFKD", texto.replace("­", "")).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", limpo)


def gramas(lista):
    return {" ".join(lista[i : i + N_GRAMA]) for i in range(len(lista) - N_GRAMA + 1)}


def questoes_do_pdf(caminho):
    documento = pdfium.PdfDocument(caminho)
    texto = "\n".join(documento[i].get_textpage().get_text_range() for i in range(len(documento)))
    partes = re.split(r"(?i)QUEST[ÃA]O\s*(\d{1,3})", texto)
    saida = collections.defaultdict(list)
    for numero, corpo in zip(partes[1::2], partes[2::2]):
        saida[int(numero)].extend(palavras(corpo))
    return saida


def le_itens(pasta):
    itens = collections.defaultdict(dict)
    for caminho in glob.glob(os.path.join(pasta, "itens_*.csv")):
        ano = int(re.search(r"(\d{4})", os.path.basename(caminho))[1])
        for linha in csv.DictReader(open(caminho, encoding="latin1"), delimiter=";"):
            if (linha["TX_COR"] or "").upper() == "AZUL":
                itens[ano, linha["SG_AREA"], linha["CO_PROVA"]][int(linha["CO_POSICAO"])] = linha
    return {chave: por_ordem(tabela) for chave, tabela in itens.items()}


def por_ordem(tabela):
    """A numeração da tabela muda de ano para ano: vira a ordem dentro da prova, de 0 a 44.

    Quando Inglês e Espanhol têm posições próprias, a prova ocupa 50 posições e o Espanhol é pulado.
    """
    inicio = min(tabela)
    extensa = max(tabela) - inicio == 49
    saida = {}
    for posicao, linha in tabela.items():
        ordem = posicao - inicio
        if extensa and 5 <= ordem <= 9:
            continue
        saida[ordem - 5 if extensa and ordem > 9 else ordem] = linha
    return saida


def parametros(linha):
    try:
        a, b, c = (float(linha[k].replace(",", ".")) for k in ("NU_PARAM_A", "NU_PARAM_B", "NU_PARAM_C"))
    except ValueError:
        return None
    if linha["IN_ITEM_ABAN"].strip() not in ("0", "") or not (0 < a <= 10 and abs(b) <= 6 and 0 <= c <= 0.6):
        return None
    return {"a": a, "b": b, "c": c}


def main():
    pasta_pdf, pasta_csv, *arquivos = sys.argv[1:]
    itens = le_itens(pasta_csv)
    cadernos = {}
    indice = collections.defaultdict(set)
    for caminho in sorted(glob.glob(os.path.join(pasta_pdf, "*.pdf"))):
        marca = re.match(r"(\d{4})_ap(\d)_d(\d)", os.path.basename(caminho))
        ano = int(marca[1])
        try:
            lido = questoes_do_pdf(caminho)
        except Exception as erro:
            print("sem leitura", os.path.basename(caminho), repr(erro)[:80])
            continue
        if len(lido) < 80:
            print("caderno incompleto", os.path.basename(caminho), len(lido))
        for numero, corpo in lido.items():
            chave = (caminho, numero)
            cadernos[chave] = (ano, gramas(corpo))
            for g in cadernos[chave][1]:
                indice[g].add(chave)
    dados = {a: json.load(open(a, encoding="utf-8")) for a in arquivos}
    achados = collections.defaultdict(list)
    placar = collections.Counter()
    for dado in dados.values():
        for q in dado["items"]:
            if q.get("irt"):
                continue
            placar["sem TRI"] += 1
            texto = " ".join([q["contextHtml"], q["stemHtml"]] + [a["html"] for a in q["alternatives"]])
            meus = gramas(palavras(re.sub(r"<[^>]+>", " ", re.sub(r'src="[^"]*"', "", texto))))
            if len(meus) < 12:
                continue
            votos = collections.Counter(c for g in meus for c in indice.get(g, ()))
            if not votos:
                continue
            chave, total = votos.most_common(1)[0]
            ano, _ = cadernos[chave]
            if total / len(meus) < MIN_TEXTO or (q.get("year") and q["year"] != ano):
                continue
            achados[chave[0], q["area"]].append(((chave[1] - 1) % 45, q))
    for (caminho, area), lista in achados.items():
        ano = int(os.path.basename(caminho)[:4])
        provas = [(codigo, tabela) for (a, ar, codigo), tabela in itens.items() if a == ano and ar == area]
        melhor, nota, conferidas = None, 0.0, 0
        for codigo, tabela in provas:
            casos = [(n, q) for n, q in lista if n in tabela and tabela[n]["TX_GABARITO"] in tuple("ABCDE")]
            if not casos:
                continue
            taxa = sum(1 for n, q in casos if tabela[n]["TX_GABARITO"] == q["answer"]) / len(casos)
            if taxa > nota or (taxa == nota and len(casos) > conferidas):
                melhor, nota, conferidas = tabela, taxa, len(casos)
        if melhor is None or nota < MIN_GABARITO or conferidas < MIN_CONFERIDAS:
            placar["caderno sem prova confirmada"] += len(lista)
            print("recusado", os.path.basename(caminho), area, len(lista), round(nota, 2), conferidas)
            continue
        for n, q in lista:
            linha = melhor.get(n)
            if linha is None or linha["TX_GABARITO"] != q["answer"]:
                placar["gabarito diferente"] += 1
                continue
            tri = parametros(linha)
            if tri is None:
                placar["sem parâmetro oficial"] += 1
                continue
            if q.get("irt") is None:
                q["irt"] = tri
                if not q.get("skill") and linha["CO_HABILIDADE"].strip().isdigit():
                    q["skill"] = f"H{int(linha['CO_HABILIDADE'])}"
                placar["com TRI novo"] += 1
    for caminho, dado in dados.items():
        json.dump(dado, open(caminho, "w", encoding="utf-8"), ensure_ascii=False)
    print(dict(placar))


if __name__ == "__main__":
    main()
