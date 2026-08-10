export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseBRL(input: string): number | null {
  const s = input.replace(/R\$|\s/g, "");
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s) && !/^-?\d+(,\d{1,2})?$/.test(s)) {
    return null;
  }
  const normalized = s.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(normalized) * 100);
}

// U+2212: o traço de menos do design, não o hífen que o toLocaleString usa.
const MINUS = "−";

/**
 * Valor com sinal explícito. Negativo sempre ganha "−"; positivo só ganha "+"
 * quando o sinal é a informação (investimento: aporte vs. resgate).
 */
export function formatSigned(cents: number, alwaysSign = false): string {
  const abs = formatBRL(Math.abs(cents));
  if (cents < 0) return MINUS + abs;
  return alwaysSign && cents > 0 ? `+${abs}` : abs;
}

/** Valor compacto para eixos e legendas: 460000 → "4,6k". Zero é só "0". */
export function formatK(cents: number): string {
  if (cents === 0) return "0";
  return `${(cents / 100000).toFixed(1).replace(".", ",")}k`;
}

/**
 * Valor sem "R$" e sem centavos: 5171200 → "51.712". Para denominadores e tabelas
 * densas, onde o "R$" repetido só ocupa espaço. Diferente de `formatK`, que serve
 * para eixos de gráfico e perde precisão embaixo de mil.
 */
export function formatUnits(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
