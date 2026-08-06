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
