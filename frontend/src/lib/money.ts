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
