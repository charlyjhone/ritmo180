// Confirmação de direitos do lote do Laboratório no Ritmo 180.
// Enquanto for null, content/laboratorio.json sai com rightsCleared: false e as questões entram em revisão,
// invisíveis para os alunos. Para publicar: preencher, rodar npm run content:laboratorio e importar de novo.
export const DIREITOS_CONFIRMADOS: { por: string; em: string } | null = { por: 'Charly (confirmado no chat)', em: '18/11/2026' };
