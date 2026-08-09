import { addMonths, monthLabel } from "../lib/months";

export default function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="month-picker">
      <button aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        ‹
      </button>
      <span className="month-label">{monthLabel(month)}</span>
      <button aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>
        ›
      </button>
    </div>
  );
}
