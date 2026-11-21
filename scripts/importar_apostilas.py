#!/usr/bin/env python3
"""Converte as apostilas autorais em PDF (pasta ENEM NOTA MIL) para o formato canônico do Ritmo 180.

Uso: python3 -I scripts/importar_apostilas.py "<pasta das apostilas>" <saida.json> [pasta de trabalho]

Lê o PDF com scripts/pdf_linhas.swift (PDFKit do macOS): o texto vem das linhas, e o que não é
texto corrido (gráfico, tabela, equação com símbolo que a extração perde) vira imagem recortada do
próprio PDF. As questões vão para a fila de revisão (npm run ingest -- <saida> --revisar), porque a
conversão automática pode errar a ordem de uma linha ou o recorte de uma figura.
"""
import base64
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
SWIFT = os.path.join(AQUI, "pdf_linhas.swift")
NOTA = "Autoria de Charly Jhone; uso confirmado pelo autor em 21/11/2026."
LETRAS = "ABCDE"
LEGENDA = re.compile(r"^(Fonte|Elaboração|Texto autoral|Figura autoral|Dados hipot|Registro hipot|Esquema|Ensaios hipot|Cenário didático|Vista |Mapa esquemático)")


def e_legenda(texto):
    """Legenda ou crédito de figura: não pode virar o comando da questão."""
    return bool(LEGENDA.match(texto)) or texto.endswith(("Figura autoral.", "elaboração própria.", "Elaboração própria.")) \
        or (len(texto) < 140 and re.search(r"sem escala|hipotétic|elaboração própria|para fins didáticos|definidas para a situação", texto, re.I) is not None)


# Começo de frase que costuma abrir o comando quando ele vem colado ao texto-base, sem ponto antes.
ABERTURA = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ])|\s(?=(?:Ao|Considerando|Com base|De acordo|Admitindo|Desprezando|A partir)\s)")


def comando_aberto(texto):
    """Comando que termina sem pontuação ("... é o", "deve-se"): a frase continua nas alternativas."""
    return not re.search(r"[.!?:;)]$", texto.strip())
TITULO = "\x00"

# ---------------------------------------------------------------- leitura do PDF


def linhas_do_pdf(pdf, trabalho):
    saida = os.path.join(trabalho, os.path.basename(pdf) + ".linhas.json")
    subprocess.run(["swift", SWIFT, "linhas", pdf, saida], check=True, capture_output=True)
    with open(saida, encoding="utf-8") as f:
        dados = json.load(f)
    return dados["sizes"], dados["lines"]


def recortar(pdf, pedidos, trabalho):
    """Recorta várias regiões de uma vez e devolve cada PNG em base64."""
    if not pedidos:
        return []
    arquivo = os.path.join(trabalho, "pedidos.json")
    for i, p in enumerate(pedidos):
        p["out"] = os.path.join(trabalho, f"recorte-{i}.png")
    with open(arquivo, "w") as f:
        json.dump(pedidos, f)
    subprocess.run(["swift", SWIFT, "recortes", pdf, arquivo], check=True, capture_output=True)
    with open(arquivo + ".tinta.json") as f:
        tintas = json.load(f)
    imagens = []
    for p, tinta in zip(pedidos, tintas):
        with open(p["out"], "rb") as f:
            # Recorte quase todo branco é só espaço entre parágrafos.
            imagens.append(base64.b64encode(f.read()).decode() if tinta > 0.004 else None)
    return imagens


class Linha:
    def __init__(self, d, largura_pagina):
        self.page, self.x, self.y, self.w, self.h, self.text = d["page"], d["x"], d["y"], d["w"], d["h"], d["text"]
        self.col = 0 if self.x + min(self.w, 40) / 2 < largura_pagina / 2 - 8 else 1
        self.segs = [self]
        self.forca = False  # dentro de uma figura marcada à mão: nunca vira texto

    @property
    def fim(self):
        return self.y + self.h


def fluxo(sizes, brutas, margem_topo=40, margem_base=40):
    """Linhas em ordem de leitura (página, coluna, altura), sem cabeçalho e rodapé.
    Trechos na mesma altura e coluna viram uma linha só, guardando os pedaços (tabelas)."""
    largura, altura = sizes[0]
    linhas = [Linha(d, largura) for d in brutas if margem_topo <= d["y"] <= altura - margem_base]
    linhas.sort(key=lambda l: (l.page, l.col, round(l.y), l.x))
    juntas = []
    for l in linhas:
        ult = juntas[-1] if juntas else None
        if ult and ult.page == l.page and ult.col == l.col and abs(ult.y - l.y) < 3:
            ult.segs.append(l)
            ult.text = f"{ult.text} {l.text}"
            ult.w = max(ult.x + ult.w, l.x + l.w) - ult.x
            ult.h = max(ult.h, l.h)
        else:
            juntas.append(l)
    return juntas


# ---------------------------------------------------------------- montagem da questão

ALT = re.compile(r"^\(?([A-E])(?:\)|\.)?\s+(.*)$")


def separar_alternativas(bloco):
    """Acha a última sequência A..E do bloco; devolve (linhas do enunciado, [linhas de cada alternativa])."""
    inicios = [None] * 5
    procura = 4
    for i in range(len(bloco) - 1, -1, -1):
        m = ALT.match(bloco[i].text)
        if m and m.group(1) == LETRAS[procura]:
            inicios[procura] = i
            procura -= 1
            if procura < 0:
                break
    if procura >= 0:
        return None
    alts = []
    for k in range(5):
        fim = inicios[k + 1] if k < 4 else len(bloco)
        alts.append(bloco[inicios[k]:fim])
    return bloco[: inicios[0]], alts


def texto_corrido(linha, largura_coluna):
    if len(linha.segs) > 1 or "  " in linha.text or "\x00" in linha.text or "\ufffd" in linha.text:
        return False  # tabela ou equação com símbolo perdido: vai como imagem
    return linha.w >= 0.42 * largura_coluna or re.match(r"^(Fonte|Elaboração|Texto autoral|Figura|Dados|Registro)", linha.text)


def paragrafos(linhas, largura_coluna):
    """Junta linhas em parágrafos. Linha curta fecha o parágrafo."""
    saida, atual = [], []
    alturas = sorted(l.h for l in linhas) or [0]
    comum = alturas[len(alturas) // 2]
    for l in linhas:
        if comum and l.h > 1.3 * comum:
            # Fonte bem maior que a do texto: título, em parágrafo próprio.
            if atual:
                saida.append(" ".join(atual))
                atual = []
            saida.append(TITULO + l.text)
            continue
        if atual and LEGENDA.match(l.text):
            saida.append(" ".join(atual))
            atual = []
        atual.append(l.text)
        # Linha curta só fecha o parágrafo se a frase terminou nela.
        if l.w < 0.85 * largura_coluna and re.search(r"[.:?!;)]$", l.text):
            saida.append(" ".join(atual))
            atual = []
    if atual:
        saida.append(" ".join(atual))
    # Legenda de figura colada ao texto seguinte: separa depois de "Figura autoral." e afins.
    separados = []
    for p in saida:
        marcado = re.sub(r"((?:Figura autoral|[Ee]laboração própria)\.)\s+", "\\1\x01", p)
        separados.extend(x for x in marcado.split("\x01") if x)
    return [p for p in separados if p.strip()]


def montar_html(linhas, largura_coluna, pdf_info, figuras):
    """Texto corrido vira <p>; o resto (gráfico, tabela, equação) vira recorte de imagem."""
    sizes, limites = pdf_info
    altura_pagina = sizes[0][1]
    partes = []  # ("p", [linhas]) ou ("fig", pedido)
    texto = []
    ultima = None
    pendente = []  # linhas que não são texto corrido

    def fecha_texto():
        if texto:
            partes.append(("p", list(texto)))
            texto.clear()

    def fecha_figura(proxima):
        nonlocal pendente
        if ultima is None and not pendente:
            return
        base = ultima or pendente[0]
        topo = (ultima.fim + 1) if ultima and (not pendente or pendente[0].page == ultima.page) else (pendente[0].y - 4)
        if proxima is not None and proxima.page == base.page and proxima.col == base.col:
            fundo = proxima.y - 1
        elif pendente:
            fundo = pendente[-1].fim + 6
        else:
            fundo = altura_pagina - 42
        if fundo - topo < 14 and not pendente:
            pendente = []
            return
        x0, x1 = limites[base.col]
        fecha_texto()
        # Texto sobreposto no PDF sai embaralhado (com vãos duplos): fica fora da descrição da figura.
        alt = " ".join(l.text for l in pendente if not (l.forca and "  " in l.text)).strip()
        partes.append(("fig", {"page": base.page, "x": x0, "y": topo, "w": x1 - x0, "h": max(fundo - topo, 10), "alt": alt}))
        pendente = []

    for l in linhas:
        if pendente and l.page == pendente[-1].page and l.col == pendente[-1].col and l.y - pendente[-1].fim <= 8 \
                and l.w < 0.85 * largura_coluna and not re.search(r"[.:?!]$", l.text) and not LEGENDA.match(l.text):
            pendente.append(l)  # linha curta colada à tabela: continua na tabela
            continue
        corrido = texto_corrido(l, largura_coluna) and not l.forca
        continua = not l.forca and ultima is not None and ultima.page == l.page and ultima.col == l.col and 0 <= l.y - ultima.fim <= 7 and not pendente
        if corrido or (continua and len(l.segs) == 1 and not re.search("  |\x00|\ufffd", l.text)):
            vazio = ultima is not None and ultima.page == l.page and ultima.col == l.col and l.y - ultima.fim > 16
            if pendente or vazio:
                fecha_figura(l)
            texto.append(l)
            ultima = l
        else:
            pendente.append(l)
    if pendente:
        fecha_figura(None)
    fecha_texto()

    pedidos = [p for tipo, p in partes if tipo == "fig"]
    figuras.extend(pedidos)
    blocos = []
    for tipo, conteudo in partes:
        if tipo == "p":
            blocos.extend(("p", t) for t in paragrafos(conteudo, largura_coluna))
        else:
            blocos.append(("fig", conteudo))
    return blocos


def html_dos_blocos(blocos, imagens):
    saida = []
    for tipo, conteudo in blocos:
        if tipo == "p" and conteudo.startswith(TITULO):
            saida.append(f"<p><strong>{html.escape(conteudo[1:], quote=False)}</strong></p>")
        elif tipo == "p":
            classe = ' class="fonte"' if e_legenda(conteudo) else ""
            saida.append(f"<p{classe}>{html.escape(conteudo, quote=False)}</p>")
        else:
            png = imagens[id(conteudo)]
            if not png:
                continue
            alt = html.escape(re.sub(r"\s*[\x00\ufffd]\s*", " (seta) ", conteudo["alt"]) or "Figura da questão")
            largura = int(conteudo["w"] * 1.6)
            saida.append(f'<p><img src="data:image/png;base64,{png}" alt="{alt}" width="{largura}"></p>')
    return "".join(saida)


def questoes_do_caderno(pdf, trabalho, cabecalho, fim=None, base_compartilhada=None, topo=40, figuras_forcadas=()):
    """Devolve {número: {"contexto": blocos, "comando": blocos, "alternativas": [blocos]}} e os recortes.
    figuras_forcadas: [(página, coluna, y0, y1)] em que todo texto pertence à figura (rótulos soltos
    que a leitura automática tomaria por parágrafo e que partiriam o desenho em pedaços)."""
    sizes, brutas = linhas_do_pdf(pdf, trabalho)
    largura = sizes[0][0]
    linhas = fluxo(sizes, brutas, topo)
    for l in linhas:
        l.forca = any(l.page == p and l.col == c and y0 <= l.y <= y1 for p, c, y0, y1 in figuras_forcadas)
    if fim:
        corte = next((i for i, l in enumerate(linhas) if re.search(fim, l.text)), len(linhas))
        linhas = linhas[:corte]
    corridas = sorted(l.w for l in linhas if len(l.segs) == 1 and largura * 0.25 < l.w < largura * 0.55)
    largura_coluna = corridas[int(len(corridas) * 0.75)] if corridas else largura / 2
    # Linha justificada com poucas palavras sai em pedaços: se ocupa a coluna inteira e encosta em
    # texto corrido, volta a ser uma linha só.
    for k, l in enumerate(linhas):
        if len(l.segs) > 1 and l.w >= 0.9 * largura_coluna:
            vizinhas = [v for v in linhas[max(0, k - 1):k + 2] if v is not l and v.page == l.page and v.col == l.col and abs(v.y - l.y) < 16]
            if any(len(v.segs) == 1 and v.w >= 0.9 * largura_coluna for v in vizinhas):
                l.segs = [l]
    esquerda = min(l.x for l in linhas)
    limites = {0: (max(esquerda - 18, 4), largura / 2 - 4), 1: (largura / 2 + 2, largura - max(esquerda - 18, 4))}
    info = (sizes, limites)

    blocos, atual, numero = {}, [], None
    compartilhado = defaultdict(list)
    for l in linhas:
        m = re.match(cabecalho, l.text)
        if m:
            if numero is not None:
                blocos[numero] = atual
            numero, atual = int(m.group(1)), []
            continue
        if numero is not None:
            atual.append(l)
    if numero is not None:
        blocos[numero] = atual

    figuras, questoes, problemas = [], {}, {}
    if base_compartilhada:
        for pagina, numeros in base_compartilhada.items():
            texto = [l for l in fluxo(sizes, brutas, topo) if l.page == pagina]
            # Texto-base de página inteira: uma coluna só, da margem esquerda à direita.
            info_base = (sizes, {0: (max(esquerda - 18, 4), largura - max(esquerda - 18, 4)), 1: (largura / 2 + 2, largura - 8)})
            for l in texto:
                l.col = 0
            ctx = montar_html(texto, largura - 2 * esquerda, info_base, figuras)
            for n in numeros:
                compartilhado[n] = ctx
    for n, bloco in sorted(blocos.items()):
        partes = separar_alternativas(bloco)
        if not partes:
            problemas[n] = "não achei as cinco alternativas A–E"
            continue
        enunciado, alts = partes
        corpo = montar_html(enunciado, largura_coluna, info, figuras)
        textos = [i for i, (t, _) in enumerate(corpo) if t == "p" and not e_legenda(corpo[i][1])]
        if not textos:
            problemas[n] = "enunciado sem texto"
            continue
        corte = textos[-1]
        ultimo = corpo[corte][1]
        frases = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ])", ultimo)
        anterior = [i for i in textos if i < corte]
        if re.match(r"[a-zà-ú]", ultimo.lstrip(TITULO)) and anterior and comando_aberto(corpo[anterior[-1]][1]):
            # Comando partido por uma legenda no meio: o começo dele ficou no parágrafo anterior.
            j = anterior[-1]
            junto = corpo[j][1].lstrip(TITULO) + " " + ultimo.lstrip(TITULO)
            corpo = corpo[:j] + corpo[j + 1:corte] + [("p", junto)] + corpo[corte + 1:]
            corte -= 1
        elif len(textos) == 1 and len(frases) > 1:
            # Enunciado de um parágrafo só: a última frase é o comando, o resto é texto-base.
            corpo = corpo[:corte] + [("p", " ".join(frases[:-1])), ("p", frases[-1])] + corpo[corte + 1:]
            corte += 1
        elif comando_aberto(ultimo):
            # Comando colado ao fim do texto-base (dados, lista de constantes): separa na última frase.
            cortes = [m.end() for m in ABERTURA.finditer(ultimo)]
            if cortes:
                k = cortes[-1]
                corpo = corpo[:corte] + [("p", ultimo[:k].strip()), ("p", ultimo[k:].strip())] + corpo[corte + 1:]
                corte += 1
        # A figura que vem depois do comando no PDF fica antes dele, no texto-base.
        contexto = compartilhado.get(n, []) + corpo[:corte] + corpo[corte + 1:]
        comando = [corpo[corte]]
        alternativas = []
        for linhas_alt in alts:
            primeira = ALT.match(linhas_alt[0].text)
            texto = " ".join([primeira.group(2)] + [l.text for l in linhas_alt[1:] if texto_corrido(l, largura_coluna) or len(l.segs) == 1]).strip()
            alternativas.append(texto)
        if any(not a for a in alternativas):
            problemas[n] = "alternativa sem texto (provavelmente em imagem)"
            continue
        questoes[n] = {"contexto": contexto, "comando": comando, "alternativas": alternativas}
    return questoes, figuras, problemas


def finalizar(pdf, questoes, figuras, trabalho):
    imagens_lista = recortar(pdf, [{k: f[k] for k in ("page", "x", "y", "w", "h")} for f in figuras], trabalho)
    imagens = {id(f): img for f, img in zip(figuras, imagens_lista)}
    for q in questoes.values():
        q["contextHtml"] = html_dos_blocos(q["contexto"], imagens)
        q["stemHtml"] = html_dos_blocos(q["comando"], imagens)


# ---------------------------------------------------------------- gabaritos


def linhas_texto(pdf, trabalho, margem_topo=40, margem_base=40):
    sizes, brutas = linhas_do_pdf(pdf, trabalho)
    return [l.text for l in fluxo(sizes, brutas, margem_topo, margem_base)]


def juntar(linhas):
    """Linhas de um trecho de resolução viram parágrafos: quebra em frase terminada e linha seguinte com rótulo."""
    texto = " ".join(linhas)
    return re.sub(r"\s+", " ", texto).strip()


def traps_de_frase(frase):
    """'A subestima a demanda; B ignora as perdas; D e E superdimensionam' -> {A: ..., B: ..., D: ..., E: ...}"""
    traps = {}
    for parte in re.split(r";\s*|\.\s+(?=[A-E](?:,| e | ))", frase.rstrip(".")):
        m = re.match(r"^([A-E](?:(?:,\s*| e )[A-E])*)\s+(.+)$", parte.strip())
        if not m:
            continue
        for letra in re.findall(r"[A-E]", m.group(1)):
            traps[letra] = m.group(2)[0].upper() + m.group(2)[1:] + "."
    return traps


def gabarito_fisica30(pdf, trabalho):
    linhas = linhas_texto(pdf, trabalho)
    inicio = next(i for i, l in enumerate(linhas) if "Resoluções e análise" in l)
    saida, atual = {}, None
    for l in linhas[inicio + 1:]:
        m = re.match(r"^QUESTÃO (\d+) \| ([A-E]) \|", l)
        if m:
            atual = {"n": int(m.group(1)), "answer": m.group(2), "linhas": []}
            saida[atual["n"]] = atual
        elif atual:
            atual["linhas"].append(l)
    for q in saida.values():
        ls = q.pop("linhas")
        q["titulo"] = ls[0]
        corpo = " ".join(ls[1:])
        hab = re.search(r"CN:C(\d) • CN:H(\d+)\. (.*?\.)", corpo)
        if hab:
            q["competency"], q["skill"] = f"C{hab.group(1)}", f"H{hab.group(2)}"
            corpo = corpo[hab.end():]
        partes = re.split(r"\s(?=Distratores\. |Demanda cognitiva\. |Dependência do texto-base\. )", corpo)
        q["resolucao"] = [partes[0].strip()]
        q["traps"] = {}
        for p in partes[1:]:
            if p.startswith("Distratores. "):
                q["traps"] = traps_de_frase(p[len("Distratores. "):])
    return saida


def gabarito_simulado(pdf, trabalho):
    linhas = linhas_texto(pdf, trabalho)
    saida, atual = {}, None
    for l in linhas:
        m = re.search(r"QUESTÃO (\d+) - ([A-E]) \| (.*)$", l)
        if m:
            atual = {"n": int(m.group(1)), "answer": m.group(2), "titulo": m.group(3), "linhas": []}
            saida[atual["n"]] = atual
        elif atual:
            atual["linhas"].append(l)
    for q in saida.values():
        corpo = " ".join(q.pop("linhas"))
        cab = re.match(r"^(.*?)(Biologia|Física|Química) \| C(\d) - H(\d+) \| (.*?) \| dificuldade \w+\s*(.*)$", corpo)
        if not cab:
            q["erro"] = "cabeçalho da resolução não reconhecido"
            continue
        q["titulo"] = f"{q['titulo']} {cab.group(1)}".strip()
        q["discipline"], q["competency"], q["skill"], q["tema"] = cab.group(2), f"C{cab.group(3)}", f"H{cab.group(4)}", cab.group(5)
        resto = cab.group(6)
        resolucao, _, analise = resto.partition("Análise das alternativas")
        q["resolucao"] = [re.sub(r"^Resolução\.\s*", "", resolucao).strip()]
        q["traps"] = {}
        for letra, texto in re.findall(r"(?:^|\s)([A-E]) - (.*?)(?=\s[A-E] - |$)", analise.strip()):
            if not texto.startswith("Correta"):
                q["traps"][letra] = texto.strip()
    return saida


def gabarito_geografia(pdf, trabalho):
    linhas = linhas_texto(pdf, trabalho, margem_topo=20)
    inicio = next(i for i, l in enumerate(linhas) if "RESOLUÇÕES DETALHADAS" in l)
    saida, atual = {}, None
    for l in linhas[inicio + 1:]:
        m = re.match(r"^QUESTÃO (\d+) - Gabarito ([A-E])", l)
        if m:
            atual = {"n": int(m.group(1)), "answer": m.group(2), "linhas": []}
            saida[atual["n"]] = atual
        elif atual:
            atual["linhas"].append(l)
    for q in saida.values():
        corpo = " ".join(q.pop("linhas"))
        corpo = re.split(r"\s?Leitura do estímulo:", corpo)[0]
        q["resolucao"] = [corpo.strip()]
        q["traps"] = {}
    return saida


# ---------------------------------------------------------------- assuntos do banco

ASSUNTOS = {
    "Física": [
        ("Hidrostática", r"empuxo|hidrost|flutua|Arquimedes|Pascal|vasos comunicantes|mca\b|manômetro|pressão absoluta|pressão atmosf|prensa|reservatório para rede"),
        ("Física Moderna", r"fóton|fotoelétr|célula solar|limiar|relativ|quântic|nuclear|radiação ionizante"),
        ("Ondulatória", r"\bonda|sonor|\bsom\b|frequência|decib|\bdB\b|ressonân|Doppler|comprimento de onda|\beco|ultrassom|sonar|timbre|batimento|difração"),
        ("Óptica Geométrica", r"espelho|lente|refraç|reflexão total|óptic|fibra óptica|índice de refração"),
        ("Termologia", r"calor|térmic|temperatura|fusão|dilata|termodin|latente|isolante|refrigera|caloria|\bgás\b|ciclo|evapora|aquecimento solar"),
        ("Eletromagnetismo", r"magnét|induzid|indução|ímã|bobina|dínamo|transformador|motor elétrico|eletroímã"),
        ("Eletroestática", r"carga elétrica|eletriza|campo elétrico|Coulomb|capacitor|para-raios"),
        ("Impulso e Quantidade de Movimento", r"impulso|quantidade de movimento|colisão|momento linear|pouso"),
        ("Trabalho e Energia", r"energia cinética|energia potencial|energia recuperada|recuperação de energia|regenerativ|trabalho|rendimento|potência mecânica"),
        ("Eletrodinâmica", r"corrente elétrica|corrente\b(?!za)|resist|circuito|tensão|potência elétrica|kW ?h|lâmpada|bateria|autonomia|fotovolt|elétric|chuveiro|disjuntor|LED|luminos|microrrede"),
        ("Dinâmica", r"torque|equilíbrio de|alavanca|inércia|força|atrito|Newton|tração|plano inclinado"),
        ("Gravitação", r"gravitação|órbita|satélite|planeta|Kepler"),
        ("Cinemática", r"velocidade|aceleração|frenagem|distância|parada|queda livre|lançamento|movimento uniforme|MRU|deslocamento|travessia|correnteza"),
        ("Dinâmica", r"."),
    ],
    "Química": [
        ("Radioatividade", r"radioativ|meia-vida|isótopo|nuclear|decaimento"),
        ("Separação de Misturas", r"separação|filtra|decanta|destila|flocula|coagula|tratamento de água|centrifug|alcalinidade"),
        ("Eletroquímica", r"pilha|eletról|oxirredu|galvan|corros|bateria|eletrodo|metais de baterias|catalítico"),
        ("Termoquímica", r"entalpia|exotérm|endotérm|combustão|calor de|poder calorífico"),
        ("Cinética Química", r"velocidade da reação|catalis|cinética|rapidez|conservação de um"),
        ("Propriedades Coligativas", r"osmo|ebuliosc|crioscop|pressão de vapor"),
        ("Química Orgânica", r"orgânic|polímer|hidrocarbon|álcool|éster|biocombust|plástic|carbono quiral|isomeria|função orgânica|molecular"),
        ("Química Ambiental", r"poluiç|chuva ácida|efeito estufa|ambiental|contamina|drenagem ácida|dióxido de carbono"),
        ("Soluções", r"concentração|diluição|solubil|mg/L|mol/L|solução|teor|gaseificada"),
        ("Estequiometria", r"\bmol\b|massa molar|estequi|quantidade de matéria"),
        ("Ligações Químicas", r"ligaç|polaridade|intermolecular|geometria molecular"),
        ("Atomística", r"átomo|elétron|modelo atômico|próton|nêutron"),
        ("Tabela Periódica", r"tabela periódica|periódic|eletronegativ"),
        ("Química Inorgânica", r"."),
    ],
    "Biologia": [
        ("Sistema Imunológico", r"vacina|anticorpo|imunológ|memória imun|dose de reforço|soro"),
        ("Doenças", r"doença|parasit|infecç|transmiss|dengue|malária|epidem|patógen|Wolbachia|leptospir"),
        ("Vírus", r"vírus|viral|viros"),
        ("Biotecnologia e Engenharia Genética", r"transgên|clonagem|biotecnolog|CRISPR|PCR|engenharia genética|terapia gênica|inocula"),
        ("Fisiologia Humana", r"desidrata|suor|homeostase|temperatura corporal"),
        ("Ecologia", r"ecossist|ecolog|cadeia alimentar|teia|bioma|polui|eutrof|ambient|populaç|nicho|sucessão|ciclo d|biodivers|queimada|poliniza|córrego"),
        ("Evolução", r"evolu|seleção natural|especiação|adaptaç|resistência"),
        ("Genética", r"gene|DNA|herança|alelo|cromoss|mutação|heredit|ciclo celular|variante genética"),
        ("Botânica", r"planta|vegetal|flor\b|semente|raiz|folha|estômat"),
        ("Sistema Endócrino", r"hormôn|endócrin|glândula|insulina"),
        ("Sistema Digestório", r"digest|intestin|estômago"),
        ("Sistema Circulatório", r"circulat|sangue|coração|arterial"),
        ("Sistema Nervoso", r"neurôn|nervos|sinapse"),
        ("Sistema Respiratório", r"respirató|pulmã|alvéol"),
        ("Citologia/Bioquímica", r"."),
    ],
    "Geografia": [
        ("Cartografia", r"escala|mapa|projeção|coordenada|fuso|latitude|longitude"),
        ("Clima", r"clima|chuva|precipita|massa de ar|El Niño|La Niña|temperatura média|seca"),
        ("Hidrografia", r"\brio\b|bacia|hídric|aquífero|água doce|hidrovia"),
        ("Geologia", r"placa tectônica|sism|terremoto|vulc|rocha|mineral"),
        ("Solo e Relevo", r"\bsolo|relevo|erosão|planalto|planície"),
        ("Vegetação/biomas", r"bioma|vegetação|cerrado|caatinga|mata atlântica|pantanal"),
        ("Impactos Ambientais", r"desmat|queimad|poluiç|emiss|degrada|aquecimento global|mudança climática"),
        ("Migrações", r"migra|refugiad|imigra|emigra"),
        ("Geopolítica", r"geopolít|conflito|guerra|fronteira|OTAN|ONU|soberania"),
        ("Globalização", r"globaliz|multinacional|comércio internacional|comércio mundial|blocos econômicos|cadeias? (?:global|globais|produtiva)|semicondutor|estreito|rotas marítimas|repercutir mundialmente"),
        ("Economia", r"export|agro|indústri|commodit|logíst|matriz energética|eletricidade|energia|soja|minério|PIB|economia circular|reciclag|empresa"),
        ("Brasil: demografia, economia e sociedade", r"."),
    ],
}


def assunto(disciplina, *textos):
    """O primeiro texto que bate decide: título da resolução, depois o tema, depois o enunciado."""
    for texto in textos:
        if not texto:
            continue
        for nome, padrao in ASSUNTOS[disciplina]:
            if padrao != "." and re.search(padrao, texto, re.I):
                return nome
    return ASSUNTOS[disciplina][-1][0]


def item(external, area, disciplina, q, gab):
    alternativas = []
    for i, texto in enumerate(q["alternativas"]):
        alt = {"letter": LETRAS[i], "html": f"<p>{html.escape(texto, quote=False)}</p>"}
        trap = gab.get("traps", {}).get(LETRAS[i])
        if trap and LETRAS[i] != gab["answer"]:
            alt["trap"] = trap
        alternativas.append(alt)
    titulo = gab.get("titulo")
    solucao = (f"<p><strong>{html.escape(titulo)}.</strong></p>" if titulo else "") + "".join(f"<p>{html.escape(p, quote=False)}</p>" for p in gab["resolucao"] if p)
    saida = {
        "externalId": external,
        "source": "authored",
        "area": area,
        "discipline": disciplina,
        "topic": assunto(disciplina, titulo, gab.get("tema"), re.sub(r"<[^>]+>", " ", q["contextHtml"] + q["stemHtml"])),
        "contextHtml": q["contextHtml"],
        "stemHtml": q["stemHtml"],
        "alternatives": alternativas,
        "answer": gab["answer"],
        "solutionHtml": solucao,
        "prerequisites": [],
        "rightsCleared": True,
        "rightsNote": NOTA,
    }
    if gab.get("skill"):
        saida["skill"] = gab["skill"]
    if gab.get("competency"):
        saida["competency"] = gab["competency"]
    return saida


def revisar(itens):
    """Aplica a revisão editorial de scripts/apostilas_revisao.json: assunto, resolução e posição do
    gabarito de Geografia, e trocas de texto pontuais."""
    with open(os.path.join(AQUI, "apostilas_revisao.json"), encoding="utf-8") as f:
        rev = json.load(f)
    ordem, manter = rev["geografia_gabarito"]["ordem"], set(rev["geografia_gabarito"]["manter"])
    for it in itens:
        correcoes = rev["correcoes"].get(it["externalId"], [])
        for campo in ("contextHtml", "stemHtml"):
            for padrao, troca in correcoes:
                it[campo] = re.sub(padrao, troca, it[campo])
        m = re.match(r"apostila-geografia40-2026-(\d+)$", it["externalId"])
        if not m:
            continue
        n = int(m.group(1))
        it["topic"] = rev["geografia_assunto"].get(str(n), it["topic"])
        nova = rev["geografia_resolucao"].get(str(n))
        if nova:
            it["solutionHtml"] = f"<p>{html.escape(nova, quote=False)}</p>"
        # A resolução não cita a letra: ela muda de lugar logo abaixo.
        it["solutionHtml"] = re.sub(r"[Aa] alternativa [A-E]\b", "A alternativa correta", it["solutionHtml"])
        alvo = it["answer"] if n in manter else ordem[n - 1]
        if alvo != it["answer"]:
            alts = {a["letter"]: a for a in it["alternatives"]}
            alts[alvo]["html"], alts[it["answer"]]["html"] = alts[it["answer"]]["html"], alts[alvo]["html"]
            alts[alvo].pop("trap", None)
            it["answer"] = alvo
    return itens


def main():
    pasta, destino = sys.argv[1], sys.argv[2]
    trabalho = sys.argv[3] if len(sys.argv) > 3 else tempfile.mkdtemp(prefix="apostilas-")
    os.makedirs(trabalho, exist_ok=True)
    itens, relatorio = [], []

    def lote(nome, caderno, gabarito, prefixo, area, disciplina_fixa, cabecalho, **opcoes):
        pdf = os.path.join(pasta, caderno)
        questoes, figuras, problemas = questoes_do_caderno(pdf, trabalho, cabecalho, **opcoes)
        finalizar(pdf, questoes, figuras, trabalho)
        for n, motivo in problemas.items():
            relatorio.append(f"{nome} {n:02d}: {motivo}")
        for n, q in sorted(questoes.items()):
            gab = gabarito.get(n)
            if not gab or gab.get("erro"):
                relatorio.append(f"{nome} {n:02d}: {gab.get('erro') if gab else 'sem gabarito'}")
                continue
            disciplina = disciplina_fixa or gab["discipline"]
            itens.append(item(f"{prefixo}-{n:03d}", area, disciplina, q, gab))
        print(f"{nome}: {len(questoes)} questões lidas, {len(problemas)} com problema, {len(figuras)} recortes")

    lote("Física 30", "Fisica_30_Questoes_Caderno_do_Aluno.pdf", gabarito_fisica30(os.path.join(pasta, "Fisica_30_Questoes_Gabarito_Comentado.pdf"), trabalho),
         "apostila-fisica30-2026", "CN", "Física", r"^QUESTÃO (\d+)$", fim=r"^Folha de respostas", base_compartilhada={2: [1, 2, 3, 4]},
         # Q07 (esquema com legenda sobreposta), Q28 (fibra) e o rótulo do eixo vertical das Q22 e Q23.
         figuras_forcadas=[(4, 1, 500, 672), (11, 0, 240, 410), (9, 1, 145, 150), (9, 0, 454, 460)])
    lote("Simulado CN", "Simulado_ENEM_Ciencias_da_Natureza_Caderno_Amarelo.pdf", gabarito_simulado(os.path.join(pasta, "Simulado_ENEM_Ciencias_da_Natureza_Gabarito_Comentado.pdf"), trabalho),
         "simulado-cn-2026", "CN", None, r"^QUESTÃO (\d+)$")
    lote("Geografia 40", "Apostila4_Profissional_Geografia_ENEM_40Q_com_Resolucao.pdf", gabarito_geografia(os.path.join(pasta, "Apostila4_Profissional_Geografia_ENEM_40Q_com_Resolucao.pdf"), trabalho),
         "apostila-geografia40-2026", "CH", "Geografia", r"^QUESTÃO (\d+)$", fim=r"RESOLUÇÕES DETALHADAS", topo=20)

    revisar(itens)
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(itens, f, ensure_ascii=False, indent=1)
    print(f"{len(itens)} questões gravadas em {destino}")
    for r in relatorio:
        print("Fora do lote:", r)


if __name__ == "__main__":
    main()
