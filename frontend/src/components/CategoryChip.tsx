import { useCategories } from "../api/hooks";

/**
 * Chip de categoria com um `<select>` nativo transparente por cima: o visual é o do
 * design, mas quem abre a lista, navega por teclado e anuncia para leitores de tela
 * é o controle nativo. Os 29 selects visíveis eram o maior ruído da tela — o ruído
 * era visual, não o comportamento.
 */
export default function CategoryChip({
  value,
  onChange,
  ariaLabel,
  emptyLabel = "sem categoria",
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  ariaLabel: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
}) {
  const { data: categories } = useCategories();
  const options = (categories ?? []).filter((c) => !c.archived);
  const atual = value === null ? null : options.find((c) => c.id === value);
  const tone = atual?.kind === "investimento" ? " tone-invest" : "";

  return (
    <span className={`chip cat-chip${tone}`}>
      <span className="cat-chip-label">{atual ? atual.name : emptyLabel}</span>
      <span aria-hidden="true">⌄</span>
      <select
        className="cat-chip-select"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        {(allowEmpty || value === null) && <option value="">{emptyLabel}</option>}
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </span>
  );
}
