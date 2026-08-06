export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseBRL(input: string): number | null {
  const s = input.replace(/[R$\s.]/g, "").replace(",", ".");
  if (!s || Number.isNaN(Number(s))) return null;
  return Math.round(Number(s) * 100);
}
