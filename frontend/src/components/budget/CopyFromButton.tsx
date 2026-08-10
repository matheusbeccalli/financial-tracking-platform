import { addMonths, lastNMonths, monthLabel } from "../../lib/months";

/**
 * Mesmo truque do CategoryChip: o visual é um botão, mas quem abre a lista é um
 * `<select>` nativo transparente por cima — teclado e leitor de tela de graça.
 */
export default function CopyFromButton({
  month,
  disabled,
  onCopy,
}: {
  month: string;
  disabled: boolean;
  onCopy: (fromMonth: string) => void;
}) {
  const anteriores = lastNMonths(addMonths(month, -1), 12).reverse();
  const seguintes = Array.from({ length: 12 }, (_, i) => addMonths(month, i + 1));

  return (
    <span className={`copy-from${disabled ? " is-disabled" : ""}`}>
      <span>Copiar de…</span>
      <span aria-hidden="true">⌄</span>
      <select
        className="copy-from-select"
        aria-label="Copiar orçamento de outro mês"
        value=""
        disabled={disabled}
        onChange={(e) => {
          const from = e.target.value;
          // Zera antes de tudo: senão cancelar o confirm deixa o select preso no mês
          // escolhido, e escolher o mesmo mês de novo não dispara `change`.
          e.target.value = "";
          if (!from) return;
          if (
            window.confirm(
              `Substituir o orçamento de ${monthLabel(month)} pelo de ${monthLabel(from)}?`
            )
          )
            onCopy(from);
        }}
      >
        <option value="">Copiar de…</option>
        <optgroup label="Meses anteriores">
          {anteriores.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Meses seguintes">
          {seguintes.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </optgroup>
      </select>
    </span>
  );
}
