#!/usr/bin/env python3
"""Monta as questões de Linguagens e Humanas direto dos livros em PDF.

Não há banco de texto para estas disciplinas: enunciado, alternativas e figuras vêm do PDF, e o
gabarito vem das tabelas por seção no fim de cada livro. A planilha do Inep dá TRI, habilidade e o
gabarito oficial, que também confere se cada seção foi ligada à tabela certa.

Uso: montar_livros_humanas.py <pasta dos PDFs> <Banco_LC_CH_Indice_e_Radar.xlsx> <pasta de saída> <saída.json> <relatório.json>
Requer pypdf, pypdfium2, pillow e openpyxl.
"""
import base64
import collections
import difflib
import html
import json
import os
import re
import sys

import openpyxl
import pypdf
import pypdfium2 as pdfium

import extrair_figuras_livros as extrator
import montar_questoes_livros as textos

LIVROS = {
    "POR": ("PORTUGUÊS 2025.pdf", None, "Português"),
    "HIS": ("HISTÓRIA 2025.pdf", "GABARITO COMENTADO - HISTÓRIA.pdf", "História"),
    "GEO": ("GEOGRAFIA 2025.pdf", "GABARITO COMENTADO - GEOGRAFIA.pdf", "Geografia"),
    "FIL": ("FILOSOFIA 2025.pdf", "GABARITO COMENTADO-FILOSOFIA.pdf", "Filosofia"),
    "SOC": ("SOCIOLOGIA 2025.pdf", None, "Sociologia"),
}
AREA = {"Português": "LC", "Literatura": "LC", "Artes": "LC", "História": "CH", "Geografia": "CH", "Filosofia": "CH", "Sociologia": "CH"}
LITERATURA = ("TEXTOS LITERÁRIOS", "ARCADISMO", "BARROCO", "ROMANTISMO", "REALISMO", "SIMBOLISMO", "PARNASIANISMO", "PRÉ-MODERNISMO", "MODERNISMO", "LITERATURA", "TROVADORISMO", "CLASSICISMO", "QUINHENTISMO")
SOCIOLOGIA = ("PODER", "MOVIMENTOS", "CULTURA", "SOCIOLOGIA", "KARL", "MAX", "ÉMILE", "TRABALHO", "ESTADO")
NOMES = {"GÊNEROS TEXTUAIS": "Gêneros textuais", "GÊNEROS TEXTURAIS": "Gêneros textuais", "LEITURA E INTERPRETAÇÃO": "Leitura e Interpretação de Texto", "LEITURA E INTERPRETAÇÃO DE TEXTOS": "Leitura e Interpretação de Texto", "GRÁMATICA": "Gramática", "FUNÇÕES DA LINGUAGEM": "Função da Linguagem", "LINGUAGENS ARTÍSTICAS": "Artes", "REGIME MILITAR": "Governo dos Militares (1964-1985)", "ALTA/BAIXA IDADE MÉDIO": "Idade Média", "IDADE ANTIGA GRÉCIA/ROMA": "Grécia e Roma Antigas", "1° REINADO": "Primeiro Reinado", "2° REINADO": "Segundo Reinado", "GÊNERO TEXTUAL – VERBAL E MISTO": "Gêneros textuais", "BRASIL, DEMOGRAFIA, ECONOMIA E SOCIEDADE": "Brasil: demografia, economia e sociedade"}
MENORES = {"a", "as", "o", "os", "e", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos"}
NOTA = "Prova oficial do ENEM (Inep). Texto obtido dos livros Mapa do ENEM. Textos e imagens de terceiros citados na questão têm direitos próprios."
NOTA_COMENTADA = " A resolução é texto do Gabarito Comentado do Mapa do ENEM."
CABECALHO_PAGINA = re.compile(r"^(ENEM\s*20\d\d\s*[-–]|\d{1,3}$)")
LINHA_NUMEROS = re.compile(r"^\s*\d{1,3}( +\d{1,3})*\s*$")
LINHA_LETRAS = re.compile(r"^\s*[A-EV]( +[A-EV])*\s*$")
MARCA_BR = "\u0001"
FIGURA_REPETIDA = 5
SALTO_DE_SECAO = 15
PALAVRA = re.compile(r"[a-zà-ú]{5,}")
MIN_COMENTARIO = 0.25
TITULOS_SOLTOS = {"idadeantiga"}
FOLGA_ALTERNATIVA = 3
MIN_ALTERNATIVA_LONGA = 300
PONTO = 1.35 / 2.5
LARGURA_MAX = 460
ANOTACAO = re.compile(r"\(\s*([^)]*)\)?")
FIM_DA_FONTE = re.compile(r"\(adaptado\)\.?|\(fragmento\)\.?|Acesso em:? [^.]{4,24}\.(?: \d{4}\.?)?")
PRONOMES = ("se", "me", "te", "lhe", "lhes", "nos", "lo", "la", "los", "las")


def titulo(nome):
    nome = re.sub(r"\s+", " ", nome).strip()
    if nome.upper() in NOMES:
        return NOMES[nome.upper()]
    palavras = re.sub(r"\s+", " ", nome).lower().split(" ")
    return " ".join(p if (i and p in MENORES) else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def disciplina_de(livro, secao):
    base = LIVROS[livro][2]
    if livro == "POR":
        secao = secao.upper()
        if secao.startswith(("ARTES", "LINGUAGENS ARTÍSTICAS")):
            return "Artes"
        if secao.startswith(LITERATURA):
            return "Literatura"
    if livro in ("FIL", "SOC"):
        return "Sociologia" if secao.upper().startswith(SOCIOLOGIA) else "Filosofia" if "FILOSOFIA" in secao.upper() or "CONHECIMENTO" in secao.upper() else base
    return base


def tabelas(caminho):
    """Lê as tabelas de gabarito no fim do livro, na ordem em que aparecem."""
    leitor = pypdf.PdfReader(caminho)
    saida, atual, numeros = [], None, None
    for i in range(max(0, len(leitor.pages) - 16), len(leitor.pages)):
        for linha in (leitor.pages[i].extract_text() or "").split("\n"):
            limpa = linha.strip()
            if not limpa:
                continue
            if LINHA_NUMEROS.match(limpa):
                numeros = [int(n) for n in limpa.split()]
            elif LINHA_LETRAS.match(limpa) and numeros and atual is not None:
                atual["respostas"].update(zip(numeros, limpa.split()))
                numeros = None
            elif re.match(r"^[A-ZÀ-Ú0-9°]", limpa) and len(limpa) < 80:
                atual = {"nome": limpa, "respostas": {}, "pagina": i}
                saida.append(atual)
                numeros = None
    return [t for t in saida if t["respostas"]]


def secoes_do_livro(questoes):
    """A numeração recomeça em 1 a cada seção. Conserta número trocado por erro de digitação do livro."""
    grupos = [[questoes[0]]]
    for i, q in enumerate(questoes[1:], 1):
        anterior = grupos[-1][-1]["num"]
        proximo = questoes[i + 1]["num"] if i + 1 < len(questoes) else None
        if q["num"] == 1 and anterior != 1:
            grupos.append([])
        elif len(grupos) > 1 and q["num"] != anterior + 1 and proximo == anterior + 2:
            q["num"] = anterior + 1
        elif len(grupos) > 1 and q["num"] > anterior + SALTO_DE_SECAO:
            grupos.append([])
        grupos[-1].append(q)
    return grupos


def escolhe_tabelas(grupos, lista):
    """Dá a cada seção a tabela com mais acertos contra o gabarito oficial. Empate fica com o tamanho igual e a ordem do livro.

    Uma tabela pode servir a dois trechos quando o livro separa o fim da seção, desde que os números não se repitam.
    """
    notas = []
    for g, grupo in enumerate(grupos):
        numeros = {r["num"] for r in grupo}
        for t, tabela in enumerate(lista):
            oficiais = [r for r in grupo if r.get("oficial")]
            certas = sum(1 for r in oficiais if tabela["respostas"].get(r["num"]) == r["oficial"])
            erradas = len(oficiais) - certas
            tamanho = max(numeros) == max(tabela["respostas"])
            cobertas = len(numeros & set(tabela["respostas"]))
            notas.append((certas - 3 * erradas, cobertas == len(numeros), tamanho, -abs(g - t), g, t))
    notas.sort(reverse=True)
    ligacao, ocupados = {}, collections.defaultdict(set)
    for *_, g, t in notas:
        numeros = {r["num"] for r in grupos[g]}
        if g not in ligacao and not (ocupados[t] & numeros) and numeros <= set(lista[t]["respostas"]):
            ligacao[g] = t
            ocupados[t] |= numeros
    for *_, g, t in notas:
        if g not in ligacao:
            ligacao[g] = t
    return ligacao


def junta_linhas(partes):
    """Refaz o texto: tira o hífen de fim de linha e guarda parágrafos e versos."""
    linhas = [p for p in partes if not CABECALHO_PAGINA.match(p["texto"])]
    if not linhas:
        return ""
    largura = max(l["x1"] - l["x"] for l in linhas)
    passos = sorted(a["topo"] - b["topo"] for a, b in zip(linhas, linhas[1:]) if a["pagina"] == b["pagina"] and a["col"] == b["col"] and a["topo"] > b["topo"])
    passo = passos[len(passos) // 2] if passos else 14
    texto = ""
    for i, linha in enumerate(linhas):
        trecho = linha["texto"].strip()
        anterior = linhas[i - 1] if i else None
        if anterior is None:
            texto = trecho
            continue
        salto = anterior["pagina"] == linha["pagina"] and anterior["col"] == linha["col"] and anterior["topo"] - linha["topo"] > passo * 1.45
        curta = anterior["x1"] - anterior["x"] < 0.72 * largura
        hifenizada = texto.endswith((extrator.HIFEN, "-")) and re.match(r"[a-zà-ú]", trecho)
        if salto:
            texto = texto.rstrip(extrator.HIFEN) + "\n" + trecho
        elif hifenizada:
            pronome = re.match(r"[a-zà-ú]+", trecho)[0] in PRONOMES
            texto = texto.rstrip(extrator.HIFEN + "-") + ("-" if pronome else "") + trecho
        elif curta:
            texto += MARCA_BR + trecho
        else:
            texto += " " + trecho
    return texto.replace(extrator.HIFEN, "")


def html_texto(texto):
    blocos = []
    for bloco in texto.split("\n"):
        if bloco.strip():
            versos = [textos.escreve(v, "POR") for v in bloco.split(MARCA_BR) if v.strip()]
            blocos.append("<p>" + "<br>".join(versos) + "</p>")
    return "".join(blocos)


def figura(documento, parte, pasta, nome):
    destino = os.path.join(pasta, nome)
    largura, altura = extrator.recorta(documento[parte["pagina"]], parte["caixa"], destino)
    with open(destino, "rb") as arquivo:
        dados = base64.b64encode(arquivo.read()).decode()
    fator = min(PONTO, LARGURA_MAX / largura)
    return f'<p><img src="data:image/webp;base64,{dados}" alt="Figura da questão" width="{round(largura * fator)}" height="{round(altura * fator)}"></p>'


def blocos_da_vaga(partes, documento, pasta, prefixo, repetidas):
    saida, pendentes, figuras = [], [], 0
    for parte in partes:
        if parte["tipo"] == "linha":
            pendentes.append(parte)
            continue
        if tuple(round(c) for c in parte["caixa"]) in repetidas:
            continue
        if pendentes:
            saida.append(("texto", junta_linhas(pendentes)))
            pendentes = []
        saida.append(("figura", figura(documento, parte, pasta, f"{prefixo}-{figuras}.webp")))
        figuras += 1
    if pendentes:
        saida.append(("texto", junta_linhas(pendentes)))
    return saida


def separa_enunciado(blocos):
    """O último parágrafo de texto é o comando; o resto é o texto-base."""
    html_blocos = [b if tipo == "figura" else html_texto(b) for tipo, b in blocos]
    ultimo = max((i for i, (tipo, _) in enumerate(blocos) if tipo == "texto"), default=None)
    if ultimo is None:
        return "", "".join(html_blocos)
    trecho = blocos[ultimo][1]
    if "\n" in trecho.strip():
        inicio, comando = trecho.strip().rsplit("\n", 1)
    else:
        inicio, comando = textos.separa_comando(trecho.replace(MARCA_BR, " "))
    fonte = list(FIM_DA_FONTE.finditer(comando))
    if fonte and len(comando) - fonte[-1].end() > 30:
        inicio, comando = f"{inicio}\n{comando[:fonte[-1].end()]}", comando[fonte[-1].end():]
    return "".join(html_blocos[:ultimo]) + html_texto(inicio), html_texto(comando) + "".join(html_blocos[ultimo + 1:])


def origem(cabecalho):
    conteudo = ANOTACAO.search(cabecalho)[1].strip() if ANOTACAO.search(cabecalho) else ""
    ano = re.search(r"\b(20[012]\d)\b", conteudo)
    aplicacao = "ppl" if re.search(r"(?i)ppl", conteudo) else "reaplicacao" if re.search(r"(?i)reaplic|2ª|segunda|libras|digital", conteudo) else "regular"
    return conteudo, (int(ano[1]) if ano else None), aplicacao


def norma(texto):
    return extrator.normal(re.sub(r"<img[^>]*>|<[^>]+>", " ", texto))


def le_inep(caminho):
    linhas = list(openpyxl.load_workbook(caminho, read_only=True, data_only=True)["Itens"].iter_rows(values_only=True))
    colunas = {nome: i for i, nome in enumerate(linhas[0])}
    registros = []
    for l in linhas[1:]:
        campo = lambda nome: l[colunas[nome]]
        registros.append({
            "id": campo("ID"), "area": "LC" if campo("Área") == "Linguagens" else "CH", "ano": int(campo("Ano")), "numero": campo("Nº no caderno"), "gabarito": campo("Gabarito oficial"),
            "inicio": norma(campo("Início do enunciado") or ""), "habilidade": campo("Habilidade"), "competencia": campo("Competência"), "lingua": campo("Língua"),
            "a": campo("a (discriminação)"), "b": campo("b (dificuldade)"), "c": campo("c (acerto ao acaso)"), "abandonado": campo("Abandonado") == "sim",
        })
    return registros


def procura_inep(candidato, registros, usados):
    """Liga pelo começo do texto. O número no caderno muda com a cor da prova, por isso não serve aqui."""
    corpo = norma(candidato["contextHtml"] + candidato["stemHtml"])
    melhor, nota = None, 0.0
    for r in registros:
        if r["ano"] != candidato.get("year") or r["area"] != candidato["area"] or len(r["inicio"]) < 30 or r["id"] in usados:
            continue
        if r["inicio"][:60] in corpo:
            return r, 1.0
        trecho = r["inicio"][:80]
        valor = difflib.SequenceMatcher(None, trecho, corpo[:len(trecho) + 30], autojunk=False).ratio()
        if valor > nota:
            melhor, nota = r, valor
    return (melhor, nota) if nota >= 0.82 else (None, nota)


def aplica_inep(candidato, registro):
    if registro["habilidade"] and re.fullmatch(r"H\d{1,2}", registro["habilidade"]):
        candidato["skill"] = registro["habilidade"]
    if registro["competencia"] and re.fullmatch(r"C\d", registro["competencia"]):
        candidato["competency"] = registro["competencia"]
    valores = (registro["a"], registro["b"], registro["c"])
    if not registro["abandonado"] and all(isinstance(v, (int, float)) for v in valores) and 0 < valores[0] <= 10 and abs(valores[1]) <= 6 and 0 <= valores[2] <= 0.6:
        candidato["irt"] = {"a": valores[0], "b": valores[1], "c": valores[2]}


def comentarios(caminho):
    """Lê os comentários em grupos, um por seção. A numeração recomeça em 1 a cada seção."""
    leitor = pypdf.PdfReader(caminho)
    grupos, atual, numero = [], None, None
    for pagina in leitor.pages:
        for linha in (pagina.extract_text() or "").split("\n"):
            marca = re.match(r"^\s*(\d{1,3})\s*\.\s*$", linha) or re.match(r"^\s*(\d{1,3})\s*\.\s+(?=[A-ZÀ-Ú])", linha)
            novo = int(marca[1]) if marca else None
            if marca and (novo == 1 or numero is None or numero < novo <= numero + 3):
                if novo == 1 or atual is None:
                    atual = {}
                    grupos.append(atual)
                numero = novo
                atual[numero] = [linha[marca.end():]]
            elif atual is not None and numero is not None and linha.strip():
                atual[numero].append(linha.strip())
    return [{n: " ".join(partes).strip() for n, partes in g.items()} for g in grupos]


def palavras(texto):
    return set(PALAVRA.findall(re.sub(r"<[^>]+>", " ", texto).lower()))


def parentesco(comentario, questao):
    """Parte das palavras do comentário que também estão na questão."""
    deste = palavras(comentario)
    return len(deste & palavras(questao)) / len(deste) if deste else 0.0


def texto_da_questao(q):
    return q["contextHtml"] + q["stemHtml"] + "".join(a["html"] for a in q["alternatives"])


def aplica_comentarios(grupos, notas):
    """Liga cada seção ao grupo de comentários pelo assunto, porque a ordem dos arquivos não é confiável."""
    livres = list(range(len(notas)))
    usados = 0
    for grupo in sorted(grupos, key=len, reverse=True):
        placar = [(sum(parentesco(notas[c][r["num"]], texto_da_questao(r["questao"])) for r in grupo if r["num"] in notas[c]), c) for c in livres]
        if not placar:
            break
        valor, escolhido = max(placar)
        if valor / len(grupo) < MIN_COMENTARIO:
            continue
        livres.remove(escolhido)
        for r in grupo:
            comentario = notas[escolhido].get(r["num"])
            if comentario and len(comentario) > 40 and parentesco(comentario, texto_da_questao(r["questao"])) >= MIN_COMENTARIO:
                r["questao"]["solutionHtml"] = f"<p>{html.escape(comentario, quote=False)}</p>"
                r["questao"]["rightsNote"] = NOTA + NOTA_COMENTADA
                usados += 1
    return usados


def monta_questao(q, documento, pasta, livro, ordem, repetidas):
    motivos = []
    externo = f"{livro}-{ordem:02d}-{q['num']:03d}"
    conteudo, ano, aplicacao = origem(q["cabecalho"])
    partes_enunciado = q["partes"]["stem"]
    if ")" not in q["cabecalho"] and partes_enunciado and partes_enunciado[0]["tipo"] == "linha":
        conteudo = f"{conteudo} {partes_enunciado[0]['texto']}"
        partes_enunciado = partes_enunciado[1:]
    blocos = blocos_da_vaga(partes_enunciado, documento, pasta, externo, repetidas)
    contexto, comando = separa_enunciado(blocos)
    alternativas = []
    for letra in "ABCDE":
        conteudo_alt = "".join(b if tipo == "figura" else html_texto(b) for tipo, b in blocos_da_vaga(q["partes"].get(letra, []), documento, pasta, f"{externo}-{letra}", repetidas))
        if not conteudo_alt:
            motivos.append(f"alternativa {letra} ausente")
        alternativas.append({"letter": letra, "html": conteudo_alt or "<p>—</p>"})
    if len({a["html"] for a in alternativas}) < 5:
        motivos.append("alternativas repetidas")
    tamanhos = sorted(len(norma(a["html"])) for a in alternativas if "<img" not in a["html"])
    if tamanhos and tamanhos[-1] >= MIN_ALTERNATIVA_LONGA and tamanhos[-1] >= FOLGA_ALTERNATIVA * tamanhos[len(tamanhos) // 2]:
        motivos.append("alternativa com texto a mais")
    if len(norma(contexto + comando)) < 15:
        motivos.append("enunciado em imagem")
    corpo = contexto + comando
    if "<img" not in corpo and textos.FIGURA_CITADA.search(corpo):
        motivos.append("cita figura ou tabela que não veio")
    disciplina = LIVROS[livro][2]
    candidato = {
        "externalId": externo, "source": "inep_official", "area": AREA[disciplina], "discipline": disciplina, "topic": "",
        "application": aplicacao, "contextHtml": contexto, "stemHtml": comando, "alternatives": alternativas,
        "answer": "A", "solutionHtml": "", "rightsCleared": False, "rightsNote": NOTA,
    }
    if ano:
        candidato["year"] = ano
    return candidato, motivos, conteudo


def apara_questoes(questoes, lista):
    """A última questão de cada seção engole o que vem depois: título da seção seguinte e páginas de gabarito."""
    fim = min(t["pagina"] for t in lista)
    titulos = {extrator.normal(t["nome"]) for t in lista}
    for q in questoes:
        for vaga, partes in q["partes"].items():
            partes[:] = [p for p in partes if p["pagina"] < fim]
            while partes and partes[-1]["tipo"] == "linha" and extrator.normal(partes[-1]["texto"]) in titulos | TITULOS_SOLTOS:
                partes.pop()


def repara_ligaduras(texto, vocabulario):
    """O PDF dos comentários parte palavras na ligadura: "con ﬁguração"."""
    texto = texto.replace("ﬁ", "fi").replace("ﬂ", "fl")

    def junta(m):
        unida = (m[1] + m[2]).lower()
        return m[1] + m[2] if vocabulario[unida] >= 2 else m[0]
    return re.sub(r"\b([A-Za-zÀ-ú]+) (fi[a-zà-ú]+|fl[a-zà-ú]+)", junta, texto)


def cita_outra_alternativa(comentario, resposta):
    citada = re.search(r"(?i)alternativa\s+([A-E])\b", comentario)
    return bool(citada) and citada[1].upper() != resposta


def processa(livro, pasta_pdf, saida, registros, usados):
    arquivo, comentado, _ = LIVROS[livro]
    caminho = os.path.join(pasta_pdf, arquivo)
    documento = pdfium.PdfDocument(caminho)
    lista = tabelas(caminho)
    questoes = extrator.questoes_do_livro(documento)
    apara_questoes(questoes, lista)
    contagem = collections.Counter(tuple(round(c) for c in p["caixa"]) for q in questoes for ps in q["partes"].values() for p in ps if p["tipo"] == "imagem")
    repetidas = {caixa for caixa, n in contagem.items() if n >= FIGURA_REPETIDA}
    grupos = []
    for ordem, grupo in enumerate(secoes_do_livro(questoes)):
        linhas, vistos = [], collections.Counter()
        for q in grupo:
            candidato, motivos, conteudo = monta_questao(q, documento, os.path.join(saida, "figuras"), livro, ordem, repetidas)
            vistos[q["num"]] += 1
            if vistos[q["num"]] > 1:
                candidato["externalId"] += f"-{vistos[q['num']]}"
                motivos.append("número repetido no livro")
            linhas.append({"num": q["num"], "questao": candidato, "motivos": motivos, "cabecalho": conteudo})
        grupos.append(linhas)
    # O bloco da edição recente abre o livro e tem o gabarito na última tabela.
    abertura, secoes = grupos[0], grupos[1:]
    ano_recente = int(re.search(r"20\d\d", lista[-1]["nome"])[0])
    for r in abertura:
        r["questao"]["year"] = r["questao"].get("year") or ano_recente
    for r in [r for g in grupos for r in g]:
        registro, nota = procura_inep(r["questao"], registros, usados)
        r["nota"] = nota
        if registro:
            usados.add(registro["id"])
            r["inep"], r["oficial"] = registro, registro["gabarito"]
    ligacao = escolhe_tabelas(secoes, lista[:-1])
    pares = [(abertura, lista[-1])] + [(g, lista[ligacao[i]]) for i, g in enumerate(secoes)]
    for grupo, tabela in pares:
        for r in grupo:
            q = r["questao"]
            resposta = tabela["respostas"].get(r["num"])
            topico = (r["cabecalho"].rstrip(") ") if grupo is abertura and "ENEM" not in r["cabecalho"].upper() else tabela["nome"])
            q["discipline"] = disciplina_de(livro, topico)
            q["topic"] = titulo(topico)[:160]
            r["nomeSecao"] = tabela["nome"]
            if resposta not in tuple("ABCDE"):
                r["motivos"].append("sem gabarito no livro")
            else:
                q["answer"] = resposta
        certas = [r for r in grupo if r.get("oficial")]
        iguais = sum(1 for r in certas if r["oficial"] == r["questao"]["answer"])
        for r in grupo:
            r["placar"] = (iguais, len(certas))
        print(livro, f"{tabela['nome'][:32]:32}", "questões", len(grupo), "tabela", len(tabela["respostas"]), "conferidas", len(certas), "iguais", iguais)
    if comentado:
        print(livro, "comentários usados", aplica_comentarios(secoes, comentarios(os.path.join(pasta_pdf, comentado))))
    return [r for g in grupos for r in g]


def liga_recentes(brutas, registros):
    """Sem texto na planilha, o bloco de 2024 é ligado pelo número, se o gabarito da prova inteira confirmar."""
    for prefixo in ("HIS-00", "GEO-00", "FIL-00"):
        bloco = [r for r in brutas if r["questao"]["externalId"].startswith(prefixo) and "inep" not in r]
        pares = [(r, next((x for x in registros if x["ano"] == 2024 and x["area"] == "CH" and x["numero"] == r["num"]), None)) for r in bloco]
        achados = [(r, x) for r, x in pares if x]
        iguais = sum(1 for r, x in achados if x["gabarito"] == r["questao"]["answer"])
        print(prefixo, "por número", len(achados), "iguais", iguais)
        if achados and iguais / len(achados) >= 0.9:
            for r, x in achados:
                if x["gabarito"] == r["questao"]["answer"]:
                    r["inep"], r["oficial"] = x, x["gabarito"]
                    r["placar"] = (iguais, len(achados))


def main():
    pasta_pdf, planilha, pasta_saida, saida, relatorio = sys.argv[1:]
    os.makedirs(os.path.join(pasta_saida, "figuras"), exist_ok=True)
    textos.VOCABULARIO = textos.Vocabulario([])
    registros = le_inep(planilha)
    usados = set()
    brutas = [r for livro in LIVROS for r in processa(livro, pasta_pdf, pasta_saida, registros, usados)]
    liga_recentes(brutas, registros)
    vistos = {}
    prontas, revisar, duplicadas = [], [], 0
    for r in sorted(brutas, key=lambda x: "inep" not in x):
        q = r["questao"]
        chave = norma(q["contextHtml"] + q["stemHtml"])[:220] + norma("".join(a["html"] for a in q["alternatives"]))[:80]
        if chave in vistos:
            duplicadas += 1
            continue
        vistos[chave] = q["externalId"]
        iguais, total = r["placar"]
        if "inep" in r:
            if r["oficial"] != q["answer"]:
                r["motivos"].append(f"gabarito do livro {q['answer']} difere do oficial {r['oficial']}")
                q["answer"] = r["oficial"]
            aplica_inep(q, r["inep"])
        if total >= 3 and iguais / total < 0.8:
            r["motivos"].append(f"seção com gabarito desalinhado ({iguais} de {total})")
        if total == 0:
            r["motivos"].append("seção sem conferência pelo gabarito oficial")
        if cita_outra_alternativa(q["solutionHtml"], q["answer"]):
            q["solutionHtml"] = ""
            q["rightsNote"] = NOTA
        (revisar if r["motivos"] else prontas).append(r)
    vocabulario = collections.Counter(w.lower() for r in prontas for w in re.findall(r"[A-Za-zÀ-ú]+", texto_da_questao(r["questao"]).replace("ﬁ", "fi").replace("ﬂ", "fl")))
    for r in prontas + revisar:
        q = r["questao"]
        q["solutionHtml"] = repara_ligaduras(q["solutionHtml"], vocabulario)
        q["contextHtml"], q["stemHtml"] = repara_ligaduras(q["contextHtml"], vocabulario), repara_ligaduras(q["stemHtml"], vocabulario)
        for a in q["alternatives"]:
            a["html"] = repara_ligaduras(a["html"], vocabulario)
    json.dump({"items": [r["questao"] for r in prontas]}, open(saida, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump([{"id": r["questao"]["externalId"], "secao": r["nomeSecao"], "num": r["num"], "motivos": r["motivos"], "questao": r["questao"]} for r in revisar], open(relatorio, "w", encoding="utf-8"), ensure_ascii=False)
    print("brutas", len(brutas), "duplicadas", duplicadas, "prontas", len(prontas), "a revisar", len(revisar))
    print("por disciplina", collections.Counter(r["questao"]["discipline"] for r in prontas))
    print("ligadas ao Inep", sum(1 for r in prontas + revisar if "inep" in r), "de", len(registros), "com TRI", sum(1 for r in prontas if r["questao"].get("irt")), "com resolução", sum(1 for r in prontas if r["questao"]["solutionHtml"]))
    print("por aplicação", collections.Counter(r["questao"]["application"] for r in prontas), "por ano", sorted(collections.Counter(r["questao"].get("year") for r in prontas).items(), key=str))
    print("motivos", collections.Counter(re.sub(r"\d+|alternativa [A-E]|[A-E] difere|oficial [A-E]", "#", m) for r in revisar for m in r["motivos"]).most_common(10))
    print("tamanho MB", round(os.path.getsize(saida) / 1e6, 1))


if __name__ == "__main__":
    main()
