import { addMonths, monthLabel } from "../lib/months";

export default function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="row">
      <button aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        ◀
      </button>
      <strong style={{ minWidth: 70, textAlign: "center" }}>{monthLabel(month)}</strong>
      <button aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>
        ▶
      </button>
    </div>
  );
}
