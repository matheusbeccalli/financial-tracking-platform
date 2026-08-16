/** Comparador pt-BR compartilhado: caixa- e acento-insensível. */
export const collatePt = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/** Ordenação pelo campo `nome` — o shape das linhas de orçamento/tendências. */
export const porNome = (a: { nome: string }, b: { nome: string }) =>
  collatePt(a.nome, b.nome);
