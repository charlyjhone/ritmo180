#!/usr/bin/env python3
"""Acrescenta os Gabaritos Comentados às questões de Natureza e Matemática que estão sem resolução.

O arquivo de comentários se parte em muitos trechos, então cada questão procura o comentário de mesmo
número e só o aceita com prova forte: palavras raras em comum, a resposta certa citada quando ela é um
número e nenhuma outra questão disputando o mesmo comentário. Resolução errada é pior que nenhuma, e por
isso a maior parte dos comentários fica de fora. Nunca troca uma resolução que já existe.

Uso: completar_resolucoes.py <pasta dos PDFs> <banco v2.json> <questoes-livros.json>
"""
import collections
import html
import json
import math
import os
import re
import sys

import montar_livros_humanas as humanas

LIVROS = {"FIS": "GABARITO COMENTADO - FÍSICA.pdf", "QUI": "GABARITO COMENTADO - QUÍMICA.pdf", "BIO": "GABARITO COMENTADO - BIOLOGIA.pdf", "MAT": "GABARITO COMENTADO - MATEMÁTICA.pdf"}
MIN_PARENTESCO = 0.35
MIN_RARAS = 4
MIN_TAMANHO = 120
RARA = 0.02


def termos(texto):
    return set(w.lower() for w in re.findall(r"[A-Za-zÀ-ú]{5,}", texto))


def perdeu_formula(comentario):
    """As fórmulas do PDF são imagens: sem elas sobra frase pela metade, conta achatada ou letra espaçada."""
    texto = comentario.strip()
    return bool(
        re.search(r"[:=+,]$|\b(Afinal|Assim|Logo|Portanto|Então|temos|teremos)\s*$", texto)
        or re.search(r":\s+[A-ZÀ-Ú]", texto)
        or re.search(r"\b(temos|teremos|dado por|fórmula|equação|expressão)\s*[.:]?\s+[A-ZÀ-Ú]", texto)
        or re.search(r"(?:\b\w\s){5}", texto)
        or re.search(r"\b(de|igual|é|a)\s*\.\s|:\s*\.", texto)
        or re.search(r"[a-z]\d+\s?[a-z]", texto)
    )


def resposta_numerica(questao):
    certa = next((a["html"] for a in questao["alternatives"] if a["letter"] == questao["answer"]), "")
    return re.findall(r"\d[\d .,]*\d|\d", re.sub(r"<[^>]+>", " ", re.sub(r'src="[^"]*"', "", certa)))


def sem_a_resposta(comentario, questao):
    """Na alternativa numérica, o comentário certo costuma chegar ao mesmo número."""
    numeros = resposta_numerica(questao)
    enxuto = re.sub(r"[ .]", "", comentario)
    return bool(numeros) and not any(re.sub(r"[ .]", "", n) in enxuto for n in numeros)


def main():
    pasta_pdf, banco, caminho = sys.argv[1:]
    itens = {i["id"]: i for i in json.load(open(banco, encoding="utf-8"))["itens"]}
    dados = json.load(open(caminho, encoding="utf-8"))
    corpo = {q["externalId"]: re.sub(r'src="[^"]*"', "", humanas.texto_da_questao(q)) for q in dados["items"]}
    vocabulario = collections.Counter(w.lower() for t in corpo.values() for w in re.findall(r"[A-Za-zÀ-ú]+", re.sub(r"<[^>]+>", " ", t)))
    frequencia = collections.Counter(w for t in corpo.values() for w in termos(t))
    limite = math.ceil(RARA * len(corpo))
    placar = collections.Counter()
    for livro, arquivo in LIVROS.items():
        notas = humanas.comentarios(os.path.join(pasta_pdf, arquivo))
        disputas = collections.defaultdict(list)
        for q in dados["items"]:
            if not q["externalId"].startswith(livro) or q["solutionHtml"]:
                continue
            placar[livro, "vazias"] += 1
            numero = int(itens[q["externalId"]]["num_livro"])
            for secao, grupo in enumerate(notas):
                comentario = grupo.get(numero)
                if not comentario or len(comentario) < MIN_TAMANHO:
                    continue
                raras = sum(1 for w in termos(comentario) & termos(corpo[q["externalId"]]) if frequencia[w] <= limite)
                nota = humanas.parentesco(comentario, corpo[q["externalId"]])
                if raras >= MIN_RARAS and nota >= MIN_PARENTESCO:
                    disputas[secao, numero].append((raras, nota, q["externalId"], comentario))
        por_id = {q["externalId"]: q for q in dados["items"]}
        for candidatos in disputas.values():
            if len(candidatos) > 1:
                placar[livro, "disputadas"] += 1
                continue
            _, _, externo, comentario = candidatos[0]
            q = por_id[externo]
            if q["solutionHtml"]:
                continue
            if humanas.cita_outra_alternativa(comentario, q["answer"]) or sem_a_resposta(comentario, q):
                placar[livro, "contradiz"] += 1
                continue
            if perdeu_formula(comentario):
                placar[livro, "sem fórmula"] += 1
                continue
            comentario = re.sub(r"(?<=[.!?])\s+[A-ZÀ-Ú][A-ZÀ-Ú ]{3,}$", "", comentario)
            q["solutionHtml"] = f"<p>{html.escape(humanas.repara_ligaduras(comentario, vocabulario), quote=False)}</p>"
            q["rightsNote"] += humanas.NOTA_COMENTADA
            placar[livro, "preenchidas"] += 1
    json.dump(dados, open(caminho, "w", encoding="utf-8"), ensure_ascii=False)
    print(dict(placar), "com resolução", sum(1 for q in dados["items"] if q["solutionHtml"]))


if __name__ == "__main__":
    main()
