#!/usr/bin/env python3
"""Monta as questões dos livros no formato do importador.

Junta o texto do banco v2, as figuras recortadas, o gabarito oficial, os parâmetros do Inep
e os mapas de distratores. Questões com algo a conferir vão para um relatório, não para o treino.

Uso: montar_questoes_livros.py <pasta do banco> <pasta de extrair_figuras_livros.py> <saída.json> <relatório.json>
Requer openpyxl.
"""
import base64
import collections
import html
import json
import os
import re
import sys
import unicodedata

import openpyxl

AREA = {"FIS": "CN", "QUI": "CN", "BIO": "CN", "MAT": "MT"}
DISCIPLINA = {"FIS": "Física", "QUI": "Química", "BIO": "Biologia", "MAT": "Matemática"}
MAPAS = {"FIS": "mapa_distratores_fisica_v1.json", "QUI": "mapa_distratores_qui_v1.json", "BIO": "mapa_distratores_bio_v1.json", "MAT": "mapa_distratores_mat_v1.json"}
NOTA_DIREITOS = "Prova oficial do ENEM (Inep). Texto obtido dos livros Mapa do ENEM. Textos e imagens de terceiros citados na questão têm direitos próprios."
ELEMENTOS = set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Ag Cd Sn Sb I Xe Cs Ba Pt Au Hg Pb Bi".split())
FORMULA = re.compile(r"(?<![A-Za-zÀ-ú0-9])(?:\(?(?:[A-Z][a-z]?)\d*\)?\d*){1,8}(?![A-Za-zÀ-ú0-9])")
PONTO = 1.35 / 2.5


class Vocabulario:
    """Junta palavras partidas por espaços do PDF, como "cha mada", usando as palavras do próprio banco."""

    def __init__(self, textos):
        self.frequencia = collections.Counter(w.lower() for t in textos for w in re.findall(r"[A-Za-zÀ-ú]+", t))

    def existe(self, palavra):
        palavra = palavra.lower()
        return palavra in PALAVRAS_CURTAS if len(palavra) < 3 else self.frequencia[palavra] >= 40

    def junta(self, texto):
        def troca(m):
            a, b = m[1], m[2]
            unido = (a + b).lower()
            separado = self.existe(a) and self.existe(b)
            return a if self.frequencia[unido] >= 3 and not separado else m[0]
        return re.sub(r"\b([A-Za-zÀ-ú]{1,12}) (?=([a-zà-ú]{1,12})\b)", troca, texto)


VOCABULARIO = None
PALAVRAS_CURTAS = set("a e o é à ao as às da de do em eu há ia já lá me na no nu os ou se si só tu um vi".split())
FIGURA_CITADA = re.compile(r"(?i)\b(?:(?:figura|gráfico|esquema|tabela|quadro|diagrama|infográfico)\s+(?:a seguir|abaixo|mostrad|apresentad|ilustrad)|(?:na|no|da|do|pela|pelo)\s+(?:figura|gráfico|esquema|tabela|diagrama)\b(?!\s+(?:periódica|\w+ica))|(?:mostrad|ilustrad|representad)[oa]s?\s+(?:a seguir|abaixo|no|na)\b)")
NOTACAO_SUSPEITA = re.compile(r"(?<![\d,./-])(?:10[1-9]|10\d\d)\s*[×x·]|[×x·]\s*10[1-9]\b|(?<![A-Za-z])m[23](?![\w,])|[A-Z][a-z]?\d[+−-](?!\d)")


def repara_potencias(texto):
    texto = re.sub(r"(\d)\s*[×xX·.]\s*10\s?([-–−]?\s?\d{1,2})(?![\d,]|\s?%)", lambda m: f"{m[1]} × 10<sup>{m[2].replace(' ', '').replace('–', '−').replace('-', '−')}</sup>", texto)
    texto = re.sub(r"(?<![\d,./])10\s?[-–−]\s?(\d{1,2})(?![\d,])", r"10<sup>−\1</sup>", texto)
    return texto


def repara_unidades(texto):
    texto = re.sub(r"(?<=[\s\d/(])(k?m|cm|mm|dm|ha)([23])(?![\w,])", r"\1<sup>\2</sup>", texto)
    texto = re.sub(r"/(s|h)([2])(?![\w])", r"/\1<sup>\2</sup>", texto)
    return texto


def formula_valida(token):
    if not re.search(r"\d", token) or not re.search(r"[A-Z]", token) or re.fullmatch(r"SP\d+|[A-Z]\d", token) and token[0] not in "ON":
        return False
    partes = re.findall(r"[A-Z][a-z]?", token)
    return all(p in ELEMENTOS for p in partes) and (len(partes) >= 2 or re.fullmatch(r"[A-Z][a-z]?\d", token) is not None)


def repara_formulas(texto):
    def troca(m):
        token = m[0]
        return re.sub(r"(?<=[A-Za-z)])(\d+)", r"<sub>\1</sub>", token) if formula_valida(token) else token
    return FORMULA.sub(troca, texto)


def limpa_espacos(texto):
    texto = re.sub(r"(?<=\w)- (?=(?:se|me|te|lhe|lhes|nos|lo|la|los|las)\b)", "-", texto)
    texto = re.sub(r"(?<=\w) -(?=\w)", "-", texto)
    texto = re.sub(r"\s+([,.;:?!])(?=\s|$)", r"\1", texto)
    texto = re.sub(r"\(\s+", "(", texto)
    texto = re.sub(r"\b(H\d+N) (\d)", r"\1\2", texto)
    texto = re.sub(r"\b((?:[A-Z][a-z]?\d?){2,}) (\d)(?=[),.;\s])", lambda m: m[1] + m[2] if formula_valida(m[1] + m[2]) and re.search(r"\d", m[1]) else m[0], texto)
    return re.sub(r"_(\w)\b", r"<sub>\1</sub>", re.sub(r"\s{2,}", " ", texto)).strip()


def escreve(texto, livro):
    seguro = limpa_espacos(html.escape(VOCABULARIO.junta(re.sub(r"[\u00a0\u2000-\u200b\u202f]", " ", texto)), quote=False))
    seguro = repara_potencias(seguro)
    if livro != "MAT":
        seguro = repara_unidades(seguro)
    else:
        seguro = re.sub(r"(?<=\d\s)(m|cm|km)([23])(?![\w,])", r"\1<sup>\2</sup>", seguro)
        seguro = re.sub(r"(?<![\w,./-])([b-hj-z])([23])(?![\w,.]\d|\w)", r"\1<sup>\2</sup>", seguro)
    if livro in ("QUI", "BIO", "FIS") and "http" not in seguro and "www." not in seguro:
        seguro = repara_formulas(seguro)
    return seguro


def normal_com_mapa(texto):
    letras, mapa = [], []
    for i, c in enumerate(texto):
        base = unicodedata.normalize("NFD", c.lower())[0]
        if base.isalnum():
            letras.append(base)
            mapa.append(i)
    return "".join(letras), mapa


def imagem(pasta, figura):
    with open(os.path.join(pasta, "figuras", figura["arquivo"]), "rb") as f:
        dados = base64.b64encode(f.read()).decode()
    largura, altura = figura["tamanho"]
    descricao = "Fórmula da questão" if figura["inline"] else "Figura da questão"
    return f'<img src="data:image/webp;base64,{dados}" alt="{descricao}" width="{round(largura * PONTO)}" height="{round(altura * PONTO)}">'


def posiciona(texto, figuras, pasta):
    """Devolve o texto com marcadores e as figuras no lugar em que apareciam no livro."""
    base, mapa = normal_com_mapa(texto)
    insercoes, finais = [], []
    for fig in figuras:
        ancora, _ = normal_com_mapa(fig["antes"])
        posicao = base.rfind(ancora[-24:]) if len(ancora) >= 6 else -1
        if posicao >= 0:
            fim = posicao + len(ancora[-24:]) - 1
            indice = mapa[fim] + 1
            while indice < len(texto) and texto[indice] in ".,;:!?)»” ":
                if texto[indice] == " " and fig["inline"]:
                    break
                indice += 1
            insercoes.append((indice, fig))
        else:
            finais.append(fig)
    return insercoes, finais


def monta_texto(texto, figuras, pasta, livro):
    insercoes, finais = posiciona(texto, figuras, pasta)
    marcados, cursor, pedacos = {}, 0, []
    for n, (indice, fig) in enumerate(sorted(insercoes, key=lambda i: i[0])):
        pedacos.append(texto[cursor:indice])
        marca = f"{n}"
        pedacos.append(f" {marca} " if fig["inline"] else f"\n{marca}\n")
        marcados[marca] = imagem(pasta, fig)
        cursor = indice
    pedacos.append(texto[cursor:])
    return "".join(pedacos), marcados, [imagem(pasta, f) for f in finais]


def separa_comando(texto):
    """A última frase costuma ser o comando. O restante vira texto-base."""
    frases = [m.start() + 1 for m in re.finditer(r"[.!?:]\s+(?=[A-ZÀ-Ú\"“])", texto)]
    uteis = [p for p in frases if len(texto) - p > 24]
    if not uteis or len(texto) < 160:
        return "", texto
    corte = uteis[-1]
    return texto[:corte].strip(), texto[corte:].strip()


def paragrafos(texto, marcados, livro):
    saida = []
    for bloco in re.split(r"\n+", texto):
        if not bloco.strip():
            continue
        html_bloco = escreve(bloco, livro)
        for marca, img in marcados.items():
            html_bloco = html_bloco.replace(marca, img)
        saida.append(f"<p>{html_bloco}</p>")
    return "".join(saida)


def bloco_final(imagens):
    return "".join(f"<p>{i}</p>" for i in imagens)


def monta(item, local, mapa, duplicatas, pasta):
    livro = item["livro"]
    motivos = []
    if item["id"] in duplicatas:
        return None, ["duplicata"]
    bandeiras = " ".join(item.get("flags") or [])
    if "ANULADA" in bandeiras:
        return None, ["anulada pelo Inep"]
    texto = item.get("texto") or (local or {}).get("enunciado") or ""
    if local is None:
        motivos.append("não localizada no PDF")
    elif local["nota"] < 0.8:
        motivos.append("texto do banco difere do PDF")
    if len(texto) < 15:
        motivos.append("enunciado em imagem")
    figuras = (local or {}).get("figuras", [])
    do_enunciado = [f for f in figuras if f["vaga"] == "stem"]
    corpo, marcados, soltas = monta_texto(texto, do_enunciado, pasta, livro)
    contexto, comando = separa_comando(corpo)
    contexto_html = paragrafos(contexto, marcados, livro) if contexto else ""
    comando_html = paragrafos(comando, marcados, livro) + bloco_final(soltas)
    alts, traps = [], (mapa or {}).get("distratores", {})
    bruto = item["alts"] if isinstance(item["alts"], dict) else {}
    for letra in "ABCDE":
        escrita = (bruto.get(letra) or (local or {}).get("alternativas", {}).get(letra) or "").strip()
        imgs = [f for f in figuras if f["vaga"] == letra]
        pendentes = [f for f in imgs if f["inline"] or f["tamanho"][1] < INLINE_PX]
        if escrita and imgs:
            corpo_alt, marcas, sobra = monta_texto(escrita, imgs, pasta, livro)
            conteudo = "".join(paragrafos(corpo_alt, marcas, livro)) + bloco_final(sobra)
        elif imgs:
            conteudo = bloco_final([imagem(pasta, f) for f in imgs])
        elif escrita:
            conteudo = f"<p>{escreve(escrita, livro)}</p>"
        else:
            conteudo = ""
            motivos.append(f"alternativa {letra} ausente")
        alt = {"letter": letra, "html": conteudo or "<p>—</p>"}
        trap = traps.get(letra) or {}
        if letra != item["gabarito"] and trap.get("raciocinio") and "sem erro" not in (trap.get("status") or "") and trap.get("confianca") in ("alta", "média", "media"):
            alt["trap"] = trap["raciocinio"]
        alts.append(alt)
    if len({a["html"] for a in alts}) < 5:
        motivos.append("alternativas repetidas")
    tudo = contexto_html + comando_html
    if "<img" not in tudo and FIGURA_CITADA.search(tudo):
        motivos.append("cita figura ou tabela que não veio")
    if NOTACAO_SUSPEITA.search(re.sub(r"<img[^>]*>|<su[pb]>.*?</su[pb]>", " ", tudo + "".join(a["html"] for a in alts))):
        motivos.append("notação científica suspeita")
    if not item.get("gabarito") or item["gabarito"] not in "ABCDE":
        return None, ["sem gabarito"]
    inep = item.get("inep") or {}
    irt = None
    if all(isinstance(inep.get(k), (int, float)) for k in "abc") and not inep.get("abandonado") and 0 < inep["a"] <= 10 and abs(inep["b"]) <= 6 and 0 <= inep["c"] <= 0.6:
        irt = {"a": inep["a"], "b": inep["b"], "c": inep["c"]}
    candidato = {
        "externalId": item["id"], "source": "inep_official", "area": AREA[livro], "discipline": DISCIPLINA[livro], "topic": item["assunto"][:160],
        "application": item["aplicacao"], "contextHtml": contexto_html, "stemHtml": comando_html, "alternatives": alts,
        "answer": item["gabarito"], "solutionHtml": f"<p>{html.escape(mapa['resolucao'], quote=False)}</p>" if mapa and mapa.get("resolucao") else "",
        "rightsCleared": False, "rightsNote": NOTA_DIREITOS,
    }
    if item.get("ano"):
        candidato["year"] = item["ano"]
    if re.fullmatch(r"H\d{1,2}", inep.get("habilidade") or ""):
        candidato["skill"] = inep["habilidade"]
    if re.fullmatch(r"C\d", item.get("_comp") or ""):
        candidato["competency"] = item["_comp"]
    if irt:
        candidato["irt"] = irt
    return candidato, motivos


INLINE_PX = 65


def main():
    banco, pasta, saida, relatorio = sys.argv[1:]
    itens = json.load(open(os.path.join(banco, "banco_ENEM_2009_2025_v2.json"), encoding="utf-8"))["itens"]
    locais = json.load(open(os.path.join(pasta, "localizacao.json"), encoding="utf-8"))
    mapas = {}
    for arquivo in MAPAS.values():
        mapas.update(json.load(open(os.path.join(banco, arquivo), encoding="utf-8")))
    planilha = openpyxl.load_workbook(os.path.join(banco, "Banco_ENEM_2009-2025_Indice_e_Radar_v2.xlsx"), read_only=True, data_only=True)
    linhas = list(planilha["Itens"].iter_rows(values_only=True))
    colunas = {nome: i for i, nome in enumerate(linhas[0])}
    duplicatas = {l[0] for l in linhas[1:] if l[colunas["Duplicata de"]]}
    global VOCABULARIO
    VOCABULARIO = Vocabulario([i.get("texto") or "" for i in itens])
    prontas, revisar, fora = [], [], collections.Counter()
    for item in itens:
        candidato, motivos = monta(item, locais.get(item["id"]), mapas.get(item["id"]), duplicatas, pasta)
        if candidato is None:
            fora[motivos[0]] += 1
        elif motivos:
            revisar.append({"id": item["id"], "motivos": motivos, "ano": item["ano"], "pagina": item.get("pag_livro"), "questao": candidato})
        else:
            prontas.append(candidato)
    json.dump({"items": prontas}, open(saida, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(revisar, open(relatorio, "w", encoding="utf-8"), ensure_ascii=False)
    print("prontas", len(prontas), "a revisar", len(revisar), "fora", dict(fora))
    print("por disciplina", collections.Counter(p["discipline"] for p in prontas))
    print("com TRI", sum(1 for p in prontas if p.get("irt")), "com resolução", sum(1 for p in prontas if p["solutionHtml"]), "com pegadinhas", sum(1 for p in prontas if any(a.get("trap") for a in p["alternatives"])))
    print("motivos", collections.Counter(m.split(" ")[0] + " " + m.split(" ")[-1] for r in revisar for m in r["motivos"]).most_common(10))
    print("tamanho MB", round(os.path.getsize(saida) / 1e6, 1))


if __name__ == "__main__":
    main()
