const MONTH_NAMES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function currentMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]}/${y.slice(2)}`;
}

export function lastNMonths(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(month, i - n + 1));
}

const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-08" → "Agosto 2026", para o h1 das telas mensais. */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_FULL[Number(m) - 1]} ${y}`;
}

/** "2026-08" → "agosto", para uso no meio de frases. */
export function monthName(month: string): string {
  return MONTH_FULL[Number(month.split("-")[1]) - 1].toLowerCase();
}

/** "2026-08-04" → "04/08". Data curta em mono, como o design pede nas tabelas. */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
