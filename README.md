# Ritmo 180

Protótipo navegável da plataforma Ritmo 180: treino de tempo e leitura para o ENEM, com painéis para aluno, professor, direção, família e rede. Todos os dados são fictícios e as questões foram criadas para a demonstração. Ainda não há back-end nem contas.

## Telas

| Rota | Tela |
|---|---|
| `#/` | Painel do aluno |
| `#/treino` | Treino com Raio-X do Tempo |
| `#/leitura` | Leitura e interpretação |
| `#/simulado` | Simulado no modo prova |
| `#/professor` | Painel do professor |
| `#/direcao` | Painel da direção |
| `#/familia` | Portal da família (celular) |
| `#/rede` | Administração da rede |
| `#/implantacao` | Implantação de uma escola |

Os botões que dependeriam de back-end (exportar relatório, enviar trilha, avisar família) só mostram um aviso de demonstração.

## Estrutura

```
server.js            HTTP: arquivos estáticos
public/app.js        roteador
public/ui.js         cabeçalho, indicadores, barras, cronômetro, toast
public/content.js    questões do treino e texto de leitura
public/screens/      uma tela por rota
public/styles.css    tokens de cor e componentes
```

## Como rodar

Requer Node 20 ou mais recente. Não há dependências para instalar.

```bash
cd ritmo180 && npm start
```

Depois abra http://localhost:5180.
