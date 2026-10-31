# Exporta as questões autorais da Super Revisão de Física para o formato canônico do Ritmo 180.
# Uso: python3 scripts/export_super_revisao.py "<pasta fonte>" content/super-revisao-fisica.json
import importlib
import json
import re
import sys

fonte, destino = sys.argv[1], sys.argv[2]
sys.path.insert(0, fonte)
lib = importlib.import_module("lib")
GRUPOS = {"q1_mecanica": "Mecânica", "q2_eletricidade": "Eletricidade", "q3_termo": "Termologia", "q4_ondas_optica": "Ondas e Óptica"}
grupo_da_questao = {}
for modulo, grupo in GRUPOS.items():
    antes = len(lib.Q.registry)
    importlib.import_module(modulo)
    for q in lib.Q.registry[antes:]:
        grupo_da_questao[q.n] = grupo


def prerequisitos(q):
    texto = f"{q.ctx} {q.stem} {q.sol}"
    chaves = ["equacao_1grau"]
    if "<svg" in f"{q.ctx}{q.fig}{q.fig_after}":
        chaves.append("leitura_grafico")
    if re.search(r"kWh|km/h|m/s|min\b|·\s?10", texto):
        chaves.append("conversao_unidades")
    if re.search(r"10<sup>|proporcional|razão", texto):
        chaves.append("potencia_dez" if "10<sup>" in texto else "proporcao")
    return chaves


LETRAS = "ABCDE"
itens = []
for q in lib.Q.registry:
    gabarito = q.ans if isinstance(q.ans, str) else LETRAS[q.ans]
    itens.append({
        "externalId": f"super-revisao-fisica-{q.n:02d}",
        "source": "authored",
        "area": "CN",
        "discipline": "Física",
        "topic": grupo_da_questao[q.n],
        "contextHtml": f"{q.ctx or ''}{q.fig or ''}",
        "stemHtml": f"{q.stem}{q.fig_after or ''}",
        "alternatives": [
            {"letter": LETRAS[i], "html": a, **({"trap": q.trap} if q.trap and LETRAS[i] != gabarito else {})}
            for i, a in enumerate(q.alts)
        ],
        "answer": gabarito,
        "solutionHtml": f"<p><strong>{q.tema}.</strong></p>{q.sol or ''}",
        "prerequisites": prerequisitos(q),
        "rightsCleared": True,
        "rightsNote": "Material autoral do projeto.",
    })

with open(destino, "w", encoding="utf-8") as saida:
    json.dump(itens, saida, ensure_ascii=False, indent=1)
print(len(itens), "questões exportadas")
