import CategoryChip from "../CategoryChip";

export default function SelectionBar({
  count,
  busy,
  onCategorizar,
  onIgnorar,
  onLimpar,
}: {
  count: number;
  busy: boolean;
  onCategorizar: (categoryId: number) => void;
  onIgnorar: () => void;
  onLimpar: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="tx-selbar" role="region" aria-label="Ações da seleção">
      <span className="tx-selbar-count">
        {count} {count === 1 ? "transação selecionada" : "transações selecionadas"}
      </span>
      <span className="tx-selbar-sep" />
      <span className="tx-selbar-cat">
        <CategoryChip
          value={null}
          onChange={(id) => id !== null && onCategorizar(id)}
          emptyLabel={busy ? "Categorizando…" : "Categorizar"}
          ariaLabel="Categorizar as transações selecionadas"
          disabled={busy}
        />
      </span>
      <button className="ghost tx-selbar-ignore" onClick={onIgnorar} disabled={busy}>
        Ignorar
      </button>
      <button className="ghost" onClick={onLimpar} disabled={busy}>
        limpar
      </button>
    </div>
  );
}
